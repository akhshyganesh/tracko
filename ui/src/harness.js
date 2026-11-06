// Shared plumbing for harnesses: start a harness program through Rust, read its output
// line by line, and answer tool calls that arrive through tracko's local MCP server.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { inApp } from './bridge.js';

const subs = new Map(); // process id -> {line, exit}
const runs = new Map(); // MCP run id -> tool handlers

if (inApp) {
  listen('proc-line', (e) => subs.get(e.payload.id)?.line?.(e.payload.line));
  listen('proc-exit', (e) => subs.get(e.payload.id)?.exit?.(e.payload));
  listen('tool-call', async (e) => {
    const { run, call_id: callId, name, args } = e.payload;
    let text;
    let isError = false;
    try {
      const h = runs.get(run)?.[name];
      if (!h) throw new Error(`Unknown tool: ${name}`);
      const out = await h(args || {});
      text = typeof out === 'string' ? out : JSON.stringify(out);
    } catch (err) {
      text = String(err?.message || err);
      isError = true;
    }
    invoke('tool_result', { callId, text, isError });
  });
}

export function onProc(id, handlers) { subs.set(id, handlers); return () => subs.delete(id); }

export function spawn({ id, harness, customPath, args, stdin = null, keepOpen = false }) {
  return invoke('proc_spawn', { req: { id, harness, custom_path: customPath || null, args, stdin, keep_open: keepOpen } });
}
export const write = (id, line) => invoke('proc_write', { id, line });
export const kill = (id) => invoke('proc_kill', { id });
export const findHarness = (harness, customPath) => invoke('harness_find', { harness, customPath: customPath || null });
export const harnessFile = (name, content) => invoke('harness_file', { name, content });

// Runs a harness once with the given input and collects everything it prints.
export function runOnce({ id, harness, customPath, args, stdin, timeoutMs = 5 * 60000, onLine }) {
  return new Promise((resolve, reject) => {
    const lines = [];
    const timer = setTimeout(() => { off(); kill(id); reject(new Error('It took too long to reply')); }, timeoutMs);
    const off = onProc(id, {
      line: (l) => { lines.push(l); onLine?.(l); },
      exit: (x) => { clearTimeout(timer); off(); resolve({ lines, code: x.code, stderr: x.stderr || '' }); },
    });
    spawn({ id, harness, customPath, args, stdin }).catch((e) => { clearTimeout(timer); off(); reject(e); });
  });
}

// Tool calls for one reply are routed to that reply's handlers by run id.
export function registerRun(run, handlers) { runs.set(run, handlers); return () => runs.delete(run); }
export const mcpInfo = () => invoke('mcp_info');
export const setMcpTools = (tools) => invoke('mcp_set_tools', {
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
});

export const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
