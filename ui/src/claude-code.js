// Claude Code harness: uses your existing Claude Code sign-in (claude.ai plan).
// Each reply runs `claude -p` once in an empty folder with all of Claude Code's own tools off
// and your personal settings skipped. tracko's tools come in through the local MCP server.
import { runOnce, registerRun, mcpInfo, setMcpTools, harnessFile, newId } from './harness.js';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', name: 'Opus 5.5', sub: 'best answers, slower' },
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', sub: 'good balance' },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', sub: 'fastest' },
];
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

function parseJson(lines) { try { return JSON.parse(lines.join('\n')); } catch { return null; } }

export async function claudeCodeStatus(customPath) {
  const r = await runOnce({ id: newId('auth'), harness: 'claude', customPath, args: ['auth', 'status'], stdin: '', timeoutMs: 30000 });
  const st = parseJson(r.lines);
  if (!st) throw new Error((r.stderr || 'Claude Code gave no status').trim().slice(0, 300));
  return st; // {loggedIn, authMethod, email, orgName, ...}
}

export async function claudeCodeTurn({ customPath, model, effort, instructions, context, input, image, tools, handlers }) {
  const run = newId('cc');
  const info = await mcpInfo();
  await setMcpTools(tools);
  const unregister = registerRun(run, handlers);
  try {
    const promptFile = await harnessFile(`${run}-prompt.txt`, `${instructions}\n\n${context}`);
    const mcpFile = await harnessFile(`${run}-mcp.json`, JSON.stringify({
      mcpServers: { tracko: { type: 'http', url: info.url + run, headers: { Authorization: `Bearer ${info.token}` } } },
    }));
    const content = [];
    if (image) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(image);
      if (m) content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    }
    content.push({ type: 'text', text: input });
    const args = [
      '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--model', model, '--effort', effort,
      '--tools', '',                                   // none of Claude Code's own tools
      '--mcp-config', mcpFile, '--strict-mcp-config',  // only tracko's tools
      '--allowedTools', tools.map((t) => `mcp__tracko__${t.name}`).join(','),
      '--setting-sources', '',                          // skip your CLAUDE.md, hooks and settings
      '--no-session-persistence',
      '--system-prompt-file', promptFile,
    ];
    const r = await runOnce({
      id: run, harness: 'claude', customPath, args,
      stdin: JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n',
    });
    let result = null;
    let usedModel = model;
    for (const l of r.lines) {
      let m;
      try { m = JSON.parse(l); } catch { continue; }
      if (m.type === 'system' && m.subtype === 'init' && m.model) usedModel = m.model;
      if (m.type === 'result') result = m;
    }
    if (!result) throw new Error((r.stderr || `Claude Code stopped (exit ${r.code})`).trim().split('\n').slice(-3).join(' ').slice(0, 300));
    if (result.is_error) throw new Error(String(result.result || result.subtype || 'Claude Code reported an error').slice(0, 300));
    const u = result.usage || {};
    return {
      text: result.result || '',
      model: usedModel,
      billed: false, // covered by your Claude plan
      usage: { in: u.input_tokens || 0, out: u.output_tokens || 0, cacheW: u.cache_creation_input_tokens || 0, cacheR: u.cache_read_input_tokens || 0 },
    };
  } finally {
    unregister();
  }
}
