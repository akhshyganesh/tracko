// Every way tracko can get AI replies, behind one shape. Settings shows them as identical rows,
// the model picker groups their models, and app.js calls provider.turn() without caring which.
//
// A provider has:
//   id, name, how         shown in Settings > Connections
//   state                 { status, account, error, path }
//                         status: unknown | checking | ready | signedOut | missing | error
//   setup                 how to fix each non-ready status (see Settings)
//   models()              [{ id, name, sub, efforts, defaultEffort }]
//   refresh(customPath)   re-check install + sign-in, fill state
//   turn(args)            one reply: { text, model, billed, usage: { in, out, cacheW, cacheR } }
//
// To add a harness: write its adapter (like claude-code.js), then add an entry here.
import * as bridge from './bridge.js';
import { runTurn } from './agent.js';
import { codex, refreshCodex, signInCodex, codexTurn } from './codex.js';
import { CLAUDE_MODELS, CLAUDE_EFFORTS, claudeCodeStatus, claudeCodeTurn } from './claude-code.js';
import { findHarness } from './harness.js';

const claudeModels = () => CLAUDE_MODELS.map((m) => ({ ...m, efforts: CLAUDE_EFFORTS, defaultEffort: 'low' }));
const notFound = (e) => /not found/i.test(String(e?.message || e));
const blank = () => ({ status: 'unknown', account: '', error: '', path: '' });

const claudeCode = {
  id: 'claude-code',
  name: 'Claude Code',
  how: 'Uses your Claude Code sign-in, so replies come out of your Claude plan. No API key needed.',
  state: blank(),
  setup: {
    missing: 'Install Claude Code from claude.com/code, then check again. If it lives somewhere unusual, paste its path.',
    signedOut: 'Run <code>claude auth login</code> in a terminal, then check again.',
  },
  models: claudeModels,
  async refresh(customPath) {
    this.state.status = 'checking';
    try {
      this.state.path = await findHarness('claude', customPath);
      const st = await claudeCodeStatus(customPath);
      this.state.status = st.loggedIn ? 'ready' : 'signedOut';
      this.state.account = [st.email, st.orgName || st.subscriptionType].filter(Boolean).join(' · ');
      this.state.error = '';
    } catch (e) {
      this.state.status = notFound(e) ? 'missing' : 'error';
      this.state.error = String(e?.message || e);
    }
  },
  turn: (a) => claudeCodeTurn(a),
};

const codexP = {
  id: 'codex',
  name: 'Codex',
  how: 'Uses your ChatGPT sign-in through the Codex app, so replies come out of your ChatGPT plan.',
  state: blank(),
  setup: {
    missing: 'Install Codex with <code>npm install -g @openai/codex</code>, then check again. If it lives somewhere unusual, paste its path.',
    signedOut: 'Sign in with your ChatGPT account. It opens in your browser.',
  },
  signIn: async () => { await signInCodex(); codexP.sync(); },
  models: () => codex.models.map((m) => ({ id: m.id, name: m.name, sub: m.isDefault ? 'default' : '', efforts: m.efforts, defaultEffort: m.defaultEffort, isDefault: m.isDefault })),
  sync() {
    const a = codex.account;
    this.state.status = codex.status === 'unavailable' ? 'missing' : codex.status;
    this.state.account = a?.type === 'chatgpt' ? [a.email || 'ChatGPT', a.planType].filter(Boolean).join(' · ') : a?.type === 'apiKey' ? 'OpenAI API key' : '';
    this.state.error = codex.error || '';
    this.state.path = codex.path || '';
  },
  async refresh(customPath) {
    this.state.status = 'checking';
    await refreshCodex(customPath);
    this.sync();
  },
  turn: (a) => codexTurn(a),
};

const claudeApi = {
  id: 'claude-api',
  name: 'Claude API',
  how: 'An Anthropic API key, stored in your system keychain. Usage is billed to that key.',
  state: blank(),
  setup: { signedOut: 'Paste an API key from console.anthropic.com.' },
  models: claudeModels,
  async refresh() {
    try {
      const k = await bridge.keyStatus();
      this.state.status = k.has ? 'ready' : bridge.inApp ? 'signedOut' : 'missing';
      this.state.account = k.has ? (k.source === 'env' ? 'From ANTHROPIC_API_KEY' : 'Key saved in keychain') : '';
      this.state.source = k.source;
    } catch (e) { this.state.status = 'error'; this.state.error = String(e?.message || e); }
  },
  async turn({ model, effort, system, messages, tools, handlers }) {
    const r = await runTurn({ model, effort, system, messages, tools, handlers });
    return { ...r, billed: true };
  },
};

export const PROVIDERS = [claudeCode, codexP, claudeApi];
export const provider = (id) => PROVIDERS.find((p) => p.id === id) || null;
export { CLAUDE_MODELS, CLAUDE_EFFORTS };
