// The Claude loop. tracko's own tools (file items, move chat, search, ...) are defined in app.js
// and passed in as `tools` + `handlers`; this file only talks to the API and runs the tool loop.
import Anthropic from '@anthropic-ai/sdk';
import { claudeFetch } from './bridge.js';

let client = null;
function getClient() {
  // The real key is added by the Rust side (see claude_fetch). This placeholder never leaves the app.
  if (!client) {
    client = new Anthropic({
      apiKey: 'added-by-tracko-backend',
      dangerouslyAllowBrowser: true,
      fetch: claudeFetch,
      maxRetries: 2,
      timeout: 120000,
    });
  }
  return client;
}

// Server-side refusal fallback is available for these models on the Claude API.
const FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export async function runTurn({ model, effort = 'low', system, messages, tools, handlers, maxSteps = 8 }) {
  const usage = { in: 0, out: 0, cacheW: 0, cacheR: 0 };
  const msgs = [...messages];
  let text = '';
  let servedBy = model;
  for (let step = 0; step < maxSteps; step++) {
    const params = {
      model,
      max_tokens: 16000,
      system,
      messages: msgs,
      tools,
      output_config: { effort },
    };
    if (FALLBACK.has(model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    const res = await getClient().beta.messages.create(params);
    const u = res.usage || {};
    usage.in += u.input_tokens || 0;
    usage.out += u.output_tokens || 0;
    usage.cacheW += u.cache_creation_input_tokens || 0;
    usage.cacheR += u.cache_read_input_tokens || 0;
    servedBy = res.model || servedBy;

    if (res.stop_reason === 'refusal') {
      return { text: "Claude declined to handle that message. Try rewording it.", usage, model: servedBy, refused: true };
    }
    const said = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (said) text = said;

    if (res.stop_reason === 'pause_turn') {
      msgs.push({ role: 'assistant', content: res.content });
      continue;
    }
    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !uses.length) {
      if (res.stop_reason === 'max_tokens' && !text) text = 'That reply got cut off. Try a shorter message.';
      return { text, usage, model: servedBy };
    }

    // Keep the full assistant turn (thinking, fallback and tool_use blocks) so the next request is append-only.
    msgs.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const b of uses) {
      let out;
      let isError = false;
      try {
        const h = handlers[b.name];
        if (!h) throw new Error(`Unknown tool: ${b.name}`);
        out = await h(b.input || {});
      } catch (e) {
        out = String(e?.message || e);
        isError = true;
      }
      results.push({
        type: 'tool_result',
        tool_use_id: b.id,
        content: typeof out === 'string' ? out : JSON.stringify(out),
        ...(isError ? { is_error: true } : {}),
      });
    }
    msgs.push({ role: 'user', content: results });
  }
  return { text: text || 'I stopped after too many steps. Try again.', usage, model: servedBy };
}

// Plain-language messages for API errors, most specific first.
export function describeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Claude rejected the API key. Check it in Settings > General.';
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model. Pick another model or check your key.";
  if (e instanceof Anthropic.NotFoundError) return "That model isn't available on this API key. Pick another one in the chat box.";
  if (e instanceof Anthropic.RateLimitError) return 'Claude is rate limiting this key right now. Wait a minute and try again.';
  if (e instanceof Anthropic.BadRequestError) return `Claude couldn't read that request: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status}). Try again in a moment.`;
  return `Something went wrong: ${e?.message || e}`;
}
