// Codex connection: runs `codex app-server` and talks JSON-RPC
// over its stdin/stdout. Sign-in is your ChatGPT account through the Codex app, so there's
// no API key here. It runs through the shared harness runner (harness.js) as process "codex".
import { openUrl } from '@tauri-apps/plugin-opener';
import { inApp } from './bridge.js';
import { spawn, write, onProc } from './harness.js';

const VERSION = '0.1.0';
let ready = null;          // promise for a started + initialized server
let nextId = 1;
const pending = new Map(); // request id -> {resolve, reject}
const listeners = new Set(); // (method, params) => void
let toolHandler = null;    // set during a turn: handles item/tool/call

export const codex = { status: 'unknown', path: null, account: null, models: [], error: null };

if (inApp) {
  onProc('codex', {
    line: (l) => onLine(l),
    exit: () => {
      ready = null;
      for (const p of pending.values()) p.reject(new Error('Codex stopped'));
      pending.clear();
      if (codex.status === 'ready') codex.status = 'stopped';
    },
  });
}

function send(msg) { return write('codex', JSON.stringify(msg)); }

function request(method, params, timeoutMs = 60000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`Codex didn't answer ${method}`)); }, timeoutMs);
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
    send({ id, method, params }).catch((e) => { pending.delete(id); clearTimeout(t); reject(e); });
  });
}

async function onLine(line) {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.id != null && !m.method) {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message || 'Codex error')); else p.resolve(m.result);
    return;
  }
  if (m.id != null && m.method) { await answerServerRequest(m); return; }
  if (m.method) for (const fn of listeners) fn(m.method, m.params || {});
}

// Codex asks us things mid-turn. tracko's tools run here; anything that would touch files or
// run commands is declined, since tracko only needs its own tools.
async function answerServerRequest(m) {
  const p = m.params || {};
  try {
    if (m.method === 'item/tool/call' && toolHandler) {
      const { text, ok } = await toolHandler(p.tool, p.arguments || {});
      await send({ id: m.id, result: { contentItems: [{ type: 'inputText', text }], success: ok } });
    } else if (m.method === 'item/commandExecution/requestApproval' || m.method === 'item/fileChange/requestApproval') {
      await send({ id: m.id, result: { decision: 'decline' } });
    } else if (m.method === 'execCommandApproval' || m.method === 'applyPatchApproval') {
      await send({ id: m.id, result: { decision: 'denied' } });
    } else {
      await send({ id: m.id, error: { code: -32601, message: `tracko doesn't support ${m.method}` } });
    }
  } catch (e) {
    await send({ id: m.id, error: { code: -32603, message: String(e?.message || e) } });
  }
}

function start(customPath) {
  if (ready) return ready;
  ready = (async () => {
    // Runs in tracko's empty harness folder (Rust sets the working directory).
    const r = await spawn({ id: 'codex', harness: 'codex', customPath, args: ['app-server'], keepOpen: true });
    codex.path = r.path;
    await request('initialize', {
      clientInfo: { name: 'tracko', title: 'tracko', version: VERSION },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    await send({ method: 'initialized' });
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

// Checks install + sign-in and loads the model list. Never throws; read codex.status.
export async function refreshCodex(customPath) {
  if (!inApp) { codex.status = 'unavailable'; return codex; }
  try {
    await start(customPath);
    const acc = await request('account/read', { refreshToken: false });
    codex.account = acc.account;
    const ml = await request('model/list', { limit: 50 });
    codex.models = (ml.data || []).filter((m) => !m.hidden).map((m) => ({
      id: m.id, name: m.displayName, description: m.description, isDefault: m.isDefault,
      efforts: (m.supportedReasoningEfforts || []).map((e) => e.reasoningEffort), defaultEffort: m.defaultReasoningEffort,
    }));
    codex.status = acc.account ? 'ready' : 'signedOut';
    codex.error = null;
  } catch (e) {
    const msg = String(e?.message || e);
    codex.status = /not found|No such file|cannot find|not installed/i.test(msg) ? 'missing' : 'error';
    codex.error = msg;
  }
  return codex;
}

// Opens the ChatGPT sign-in page in the browser and waits until Codex reports it's done.
export async function signInCodex() {
  await start();
  const r = await request('account/login/start', { type: 'chatgpt' });
  if (r.authUrl) await openUrl(r.authUrl);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => { listeners.delete(fn); reject(new Error('Sign-in timed out. Try again.')); }, 10 * 60000);
    const fn = (method, p) => {
      if (method !== 'account/login/completed') return;
      clearTimeout(t); listeners.delete(fn);
      if (p.success === false) reject(new Error(p.error || 'Sign-in failed')); else resolve();
    };
    listeners.add(fn);
  });
  return refreshCodex();
}

// One tracko reply. Each reply is a fresh, ephemeral Codex thread: tracko keeps the chat
// history itself and passes it in, so nothing piles up in ~/.codex.
export async function codexTurn({ customPath, model, effort, instructions, context, input, image, tools, handlers }) {
  await start(customPath);
  const th = await request('thread/start', {
    model, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
    baseInstructions: instructions, developerInstructions: context,
    dynamicTools: tools.map((t) => ({ type: 'function', name: t.name, description: t.description, inputSchema: t.input_schema })),
  });
  const threadId = th.thread.id;
  let text = '';
  let usage = null;
  let failure = null;
  const done = new Promise((resolve) => {
    const fn = (method, p) => {
      if (p.threadId !== threadId) return;
      if (method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.text) text = p.item.text;
      else if (method === 'thread/tokenUsage/updated') usage = p.tokenUsage?.total || usage;
      else if (method === 'error' && !p.willRetry) failure = p.error?.message || 'Codex reported an error';
      else if (method === 'turn/completed') {
        listeners.delete(fn);
        if (p.turn?.status === 'failed') failure = failure || p.turn.error?.message || 'Codex could not finish that reply';
        resolve();
      }
    };
    listeners.add(fn);
  });
  toolHandler = async (name, args) => {
    const h = handlers[name];
    if (!h) return { text: `Unknown tool: ${name}`, ok: false };
    try {
      const out = await h(args);
      return { text: typeof out === 'string' ? out : JSON.stringify(out), ok: true };
    } catch (e) { return { text: String(e?.message || e), ok: false }; }
  };
  try {
    const content = [{ type: 'text', text: input, text_elements: [] }];
    if (image) content.push({ type: 'image', url: image });
    await request('turn/start', { threadId, input: content, model, effort: effort || null });
    await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('Codex took too long to reply')), 5 * 60000))]);
  } finally {
    toolHandler = null;
  }
  if (failure) throw new Error(failure);
  const u = usage || {};
  return {
    text,
    model,
    billed: false, // covered by your ChatGPT plan
    usage: { in: Math.max(0, (u.inputTokens || 0) - (u.cachedInputTokens || 0)), out: (u.outputTokens || 0), cacheW: 0, cacheR: u.cachedInputTokens || 0 },
  };
}
