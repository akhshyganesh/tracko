// Talks to the Rust side when running inside the desktop app.
// In a plain browser (for quick UI checks) it falls back to localStorage and offline rules.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export const inApp = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent);

// Window buttons for Windows and Linux, where tracko draws its own title bar.
export const win = {
  min: () => inApp && getCurrentWindow().minimize(),
  max: () => inApp && getCurrentWindow().toggleMaximize(),
  close: () => inApp && getCurrentWindow().close(),
};
const LS_KEY = 'tracko-state';

export async function loadState() {
  if (!inApp) return localStorage.getItem(LS_KEY);
  return invoke('load_state');
}

export async function saveState(json) {
  if (!inApp) { localStorage.setItem(LS_KEY, json); return; }
  await invoke('save_state', { data: json });
}

export async function keyStatus() {
  if (!inApp) return { has: false, source: null };
  return invoke('api_key_status');
}
export const setKey = (key) => invoke('set_api_key', { key });

export async function appVersion() {
  if (!inApp) return 'dev';
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

// In-app updates through Tauri's updater plugin. Resolves to null when no newer release is out.
export async function checkForUpdate() {
  const { check } = await import('@tauri-apps/plugin-updater');
  return check();
}

export const downloadUpdate = (update) => update.download();

// Verifies and installs a downloaded update, then restarts. On Windows the installer quits tracko itself.
export async function installUpdate(update) {
  await update.install();
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
export const clearKey = () => invoke('clear_api_key');

// Writes a backup into the Downloads folder and returns the full path.
export async function exportBackup(json, name) {
  if (!inApp) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return name;
  }
  return invoke('export_backup', { data: json, name });
}

// fetch() for the Claude SDK. The request goes through Rust, which adds the API key
// and only allows https://api.anthropic.com, so the key never reaches this page.
export async function claudeFetch(input, init = {}) {
  if (!inApp) throw new Error('Claude is only available in the desktop app.');
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = {};
  new Headers(init.headers || {}).forEach((v, k) => { headers[k] = v; });
  let body = init.body ?? null;
  if (body !== null && typeof body !== 'string') body = await new Response(body).text();
  const r = await invoke('claude_fetch', { req: { url: String(url), method: init.method || 'GET', headers, body } });
  return new Response(r.status === 204 || r.status === 304 ? null : r.body, { status: r.status, headers: r.headers });
}

let notifyOk = null;
export async function notify(title, body) {
  if (!inApp) return;
  try {
    if (notifyOk === null) {
      notifyOk = await isPermissionGranted();
      if (!notifyOk) notifyOk = (await requestPermission()) === 'granted';
    }
    if (notifyOk) sendNotification({ title, body });
  } catch (e) { notifyOk = false; }
}

// Lets the app flush unsaved changes before the window closes.
export function onClose(fn) {
  if (!inApp) { addEventListener('beforeunload', () => { fn(); }); return; }
  getCurrentWindow().onCloseRequested(async () => { await fn(); });
}
