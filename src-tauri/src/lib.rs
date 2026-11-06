//! tracko desktop shell.
//!
//! The UI lives in `ui/` and runs in the system webview. This side does the few things
//! the webview shouldn't: reading and writing the data file, keeping the API key in the
//! OS credential store, and sending Claude requests with that key attached.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_window_state::StateFlags;

const KEYRING_SERVICE: &str = "app.tracko.desktop";
const KEYRING_USER: &str = "anthropic-api-key";
const DATA_FILE: &str = "tracko.json";
const KEY_FILE: &str = "api_key";
/// The only host the request proxy will talk to.
const ALLOWED_PREFIX: &str = "https://api.anthropic.com/";

struct Http(reqwest::Client);
/// The first save of each session copies the previous file to `tracko.json.bak`.
struct BackedUp(AtomicBool);

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
    Ok(dir)
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
    Ok(dir)
}

// ---------- data file ----------

#[tauri::command]
async fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join(DATA_FILE);
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Can't read {}: {e}", path.display())),
    }
}

#[tauri::command]
async fn save_state(app: AppHandle, backed_up: State<'_, BackedUp>, data: String) -> Result<(), String> {
    if !data.trim_start().starts_with('{') {
        return Err("Refusing to save data that isn't a JSON object".into());
    }
    let dir = data_dir(&app)?;
    let path = dir.join(DATA_FILE);
    if !backed_up.0.swap(true, Ordering::SeqCst) && path.exists() {
        let _ = fs::copy(&path, dir.join(format!("{DATA_FILE}.bak")));
    }
    // Write to a temp file, then rename over the old one, so a crash never leaves half a file.
    let tmp = dir.join(format!("{DATA_FILE}.tmp"));
    fs::write(&tmp, data.as_bytes()).map_err(|e| format!("Can't write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Can't replace {}: {e}", path.display()))?;
    Ok(())
}

#[tauri::command]
async fn export_backup(app: AppHandle, data: String, name: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || "-_.".contains(c) { c } else { '-' })
        .collect();
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    let path = dir.join(if safe.ends_with(".json") { safe } else { format!("{safe}.json") });
    fs::write(&path, data.as_bytes()).map_err(|e| format!("Can't write {}: {e}", path.display()))?;
    Ok(path.display().to_string())
}

// ---------- API key ----------
// Order: OS credential store, then a private file (for Linux desktops without a keyring
// service), then the ANTHROPIC_API_KEY environment variable.

fn key_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()
}

fn read_key(app: &AppHandle) -> Option<(String, &'static str)> {
    if let Some(k) = key_entry().and_then(|e| e.get_password().ok()) {
        if !k.trim().is_empty() {
            return Some((k.trim().to_string(), "keychain"));
        }
    }
    if let Ok(dir) = config_dir(app) {
        if let Ok(k) = fs::read_to_string(dir.join(KEY_FILE)) {
            if !k.trim().is_empty() {
                return Some((k.trim().to_string(), "file"));
            }
        }
    }
    std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.trim().is_empty())
        .map(|k| (k.trim().to_string(), "env"))
}

#[derive(Serialize)]
struct KeyStatus {
    has: bool,
    source: Option<&'static str>,
}

#[tauri::command]
async fn api_key_status(app: AppHandle) -> KeyStatus {
    match read_key(&app) {
        Some((_, source)) => KeyStatus { has: true, source: Some(source) },
        None => KeyStatus { has: false, source: None },
    }
}

#[tauri::command]
async fn set_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("The key is empty".into());
    }
    if let Some(entry) = key_entry() {
        if entry.set_password(&key).is_ok() && entry.get_password().ok().as_deref() == Some(key.as_str()) {
            let _ = fs::remove_file(config_dir(&app)?.join(KEY_FILE));
            return Ok(());
        }
    }
    // No working credential store: keep it in a file only this user can read.
    let path = config_dir(&app)?.join(KEY_FILE);
    fs::write(&path, key.as_bytes()).map_err(|e| format!("Can't save the key: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
async fn clear_api_key(app: AppHandle) -> Result<(), String> {
    if let Some(entry) = key_entry() {
        let _ = entry.delete_credential();
    }
    let _ = fs::remove_file(config_dir(&app)?.join(KEY_FILE));
    Ok(())
}

// ---------- Claude request proxy ----------
// The UI uses the official Claude SDK with a custom fetch that lands here.
// We add the key and pass the request through, so the key never sits in the webview.

#[derive(Deserialize)]
struct FetchReq {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize)]
struct FetchResp {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

/// Headers the webview may send that must not reach the API, or that we set ourselves.
const DROP_REQ: &[&str] = &[
    "x-api-key", "authorization", "host", "content-length", "accept-encoding", "connection",
    "origin", "referer", "user-agent", "anthropic-dangerous-direct-browser-access",
];
const DROP_RESP: &[&str] = &["content-encoding", "content-length", "transfer-encoding", "connection"];

#[tauri::command]
async fn claude_fetch(app: AppHandle, http: State<'_, Http>, req: FetchReq) -> Result<FetchResp, String> {
    if !req.url.starts_with(ALLOWED_PREFIX) {
        return Err("Blocked: tracko only sends requests to api.anthropic.com".into());
    }
    let (key, _) = read_key(&app).ok_or("No API key is set. Add one in Settings > General.")?;
    let method = reqwest::Method::from_bytes(req.method.to_ascii_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut rb = http.0.request(method, &req.url);
    for (k, v) in &req.headers {
        if !DROP_REQ.contains(&k.to_ascii_lowercase().as_str()) {
            rb = rb.header(k, v);
        }
    }
    rb = rb.header("x-api-key", key);
    if let Some(body) = req.body {
        rb = rb.body(body);
    }
    let res = rb.send().await.map_err(|e| {
        if e.is_timeout() { "The request to Claude timed out".to_string() } else { format!("Network error: {e}") }
    })?;
    let status = res.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in res.headers() {
        if DROP_RESP.contains(&k.as_str()) {
            continue;
        }
        if let Ok(s) = v.to_str() {
            headers.insert(k.as_str().to_string(), s.to_string());
        }
    }
    let body = res.text().await.map_err(|e| format!("Couldn't read Claude's reply: {e}"))?;
    Ok(FetchResp { status, headers, body })
}

// ---------- Harnesses (Claude Code, Codex, ...) ----------
// A harness is an agent CLI you've already signed in to. tracko starts it as a child process
// and talks to it over stdin/stdout; the UI holds the protocol logic for each one. Rust only:
//  - finds the program (only known harness names, never arbitrary commands),
//  - runs it in an empty folder, forwarding each stdout line as a "proc-line" event,
//  - serves tracko's tools over a local MCP endpoint for harnesses that load tools that way.

/// Harness programs tracko is allowed to start.
const HARNESSES: &[&str] = &["claude", "codex"];

struct ProcHandle {
    stdin: Option<tokio::process::ChildStdin>,
    child: tokio::process::Child,
}

#[derive(Default)]
struct Procs(tokio::sync::Mutex<HashMap<String, ProcHandle>>);

/// Extra places to look, since apps opened from a dock or menu don't get your shell's PATH.
fn search_path() -> std::ffi::OsString {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from) {
        for d in [".local/bin", ".claude/local", ".codex/packages/standalone/current/bin", ".npm-global/bin", ".bun/bin", ".volta/bin", "bin"] {
            dirs.push(home.join(d));
        }
        #[cfg(windows)]
        dirs.push(home.join("AppData").join("Roaming").join("npm"));
    }
    for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        dirs.push(PathBuf::from(d));
    }
    std::env::join_paths(dirs).unwrap_or_default()
}

fn find_harness(name: &str, custom: Option<&str>) -> Result<PathBuf, String> {
    if !HARNESSES.contains(&name) {
        return Err(format!("{name} isn't a known harness"));
    }
    if let Some(c) = custom.map(str::trim).filter(|c| !c.is_empty()) {
        let p = PathBuf::from(c);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        if !stem.starts_with(name) {
            return Err(format!("That path doesn't point to {name}"));
        }
        return if p.exists() { Ok(p) } else { Err(format!("{name} not found at {}", p.display())) };
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    which::which_in(name, Some(search_path()), cwd).map_err(|_| format!("{name} not found"))
}

#[derive(Deserialize)]
struct SpawnReq {
    id: String,
    harness: String,
    custom_path: Option<String>,
    args: Vec<String>,
    /// Written to stdin right after start.
    stdin: Option<String>,
    /// Keep stdin open for more lines (Codex). Otherwise it's closed after `stdin` is written.
    keep_open: bool,
}

#[derive(Serialize)]
struct Spawned {
    path: String,
}

#[derive(Serialize, Clone)]
struct ProcLine {
    id: String,
    line: String,
}

#[derive(Serialize, Clone)]
struct ProcExit {
    id: String,
    code: Option<i32>,
    stderr: String,
}

#[tauri::command]
async fn harness_find(harness: String, custom_path: Option<String>) -> Result<String, String> {
    find_harness(&harness, custom_path.as_deref()).map(|p| p.display().to_string())
}

#[tauri::command]
async fn proc_spawn(app: AppHandle, procs: State<'_, Procs>, req: SpawnReq) -> Result<Spawned, String> {
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

    let path = find_harness(&req.harness, req.custom_path.as_deref())?;
    let workdir = data_dir(&app)?.join("harness-work");
    fs::create_dir_all(&workdir).map_err(|e| e.to_string())?;

    let mut map = procs.0.lock().await;
    if let Some(h) = map.get_mut(&req.id) {
        if matches!(h.child.try_wait(), Ok(None)) {
            return Ok(Spawned { path: path.display().to_string() }); // already running
        }
        map.remove(&req.id);
    }

    // npm installs .cmd launchers on Windows, which have to go through cmd.exe.
    let is_cmd = path.extension().map(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat")).unwrap_or(false);
    let mut cmd = if is_cmd {
        let mut c = tokio::process::Command::new("cmd");
        c.arg("/C").arg(&path);
        c
    } else {
        tokio::process::Command::new(&path)
    };
    cmd.args(&req.args)
        .current_dir(&workdir)
        .env("PATH", search_path())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashing up

    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start {}: {e}", path.display()))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut stderr = child.stderr.take();
    let mut stdin = child.stdin.take();
    if let (Some(text), Some(si)) = (req.stdin.as_ref(), stdin.as_mut()) {
        si.write_all(text.as_bytes()).await.map_err(|e| e.to_string())?;
        si.flush().await.map_err(|e| e.to_string())?;
    }
    if !req.keep_open {
        stdin = None; // closing stdin tells one-shot harnesses the input is complete
    }
    map.insert(req.id.clone(), ProcHandle { stdin, child });
    drop(map);

    let (app2, id) = (app.clone(), req.id.clone());
    tauri::async_runtime::spawn(async move {
        let err_task = tauri::async_runtime::spawn(async move {
            let mut buf = String::new();
            if let Some(e) = stderr.as_mut() {
                let _ = e.read_to_string(&mut buf).await;
            }
            buf
        });
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app2.emit("proc-line", ProcLine { id: id.clone(), line });
        }
        let err = err_task.await.unwrap_or_default();
        let tail: String = err.chars().rev().take(4000).collect::<Vec<_>>().into_iter().rev().collect();
        let code = {
            let procs = app2.state::<Procs>();
            let mut map = procs.0.lock().await;
            let code = match map.get_mut(&id) {
                Some(h) => h.child.wait().await.ok().and_then(|s| s.code()),
                None => None,
            };
            map.remove(&id);
            code
        };
        let _ = app2.emit("proc-exit", ProcExit { id, code, stderr: tail });
    });
    Ok(Spawned { path: path.display().to_string() })
}

#[tauri::command]
async fn proc_write(procs: State<'_, Procs>, id: String, line: String) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    let mut map = procs.0.lock().await;
    let h = map.get_mut(&id).ok_or("That process isn't running")?;
    let si = h.stdin.as_mut().ok_or("That process doesn't take more input")?;
    si.write_all(line.as_bytes()).await.map_err(|e| e.to_string())?;
    si.write_all(b"\n").await.map_err(|e| e.to_string())?;
    si.flush().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn proc_kill(procs: State<'_, Procs>, id: String) -> Result<(), String> {
    if let Some(h) = procs.0.lock().await.get_mut(&id) {
        let _ = h.child.start_kill();
    }
    Ok(())
}

// ---------- local MCP server for tracko's tools ----------
// Harnesses that load tools over MCP (Claude Code) connect to http://127.0.0.1:<port>/mcp/<run>.
// Each tool call is handed to the UI as a "tool-call" event and answered with tool_result.

struct Mcp {
    port: u16,
    token: String,
    tools: std::sync::RwLock<serde_json::Value>,
    waiting: std::sync::Mutex<HashMap<String, std::sync::mpsc::Sender<(String, bool)>>>,
    next: std::sync::atomic::AtomicU64,
}

#[derive(Serialize, Clone)]
struct ToolCall {
    run: String,
    call_id: String,
    name: String,
    args: serde_json::Value,
}

fn random_token() -> String {
    let mut b = [0u8; 24];
    let _ = getrandom::getrandom(&mut b);
    b.iter().map(|x| format!("{x:02x}")).collect()
}

fn start_mcp(app: AppHandle) -> std::sync::Arc<Mcp> {
    let server = tiny_http::Server::http("127.0.0.1:0").expect("local MCP server");
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    let mcp = std::sync::Arc::new(Mcp {
        port,
        token: random_token(),
        tools: std::sync::RwLock::new(serde_json::json!([])),
        waiting: std::sync::Mutex::new(HashMap::new()),
        next: std::sync::atomic::AtomicU64::new(1),
    });
    let m = mcp.clone();
    std::thread::spawn(move || {
        for rq in server.incoming_requests() {
            let (m, app) = (m.clone(), app.clone());
            std::thread::spawn(move || handle_mcp(&m, &app, rq));
        }
    });
    mcp
}

fn handle_mcp(m: &Mcp, app: &AppHandle, mut rq: tiny_http::Request) {
    use tauri::Emitter;
    let reply = |rq: tiny_http::Request, status: u16, body: String| {
        let h = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
        let _ = rq.respond(tiny_http::Response::from_string(body).with_status_code(status).with_header(h));
    };
    let authed = rq.headers().iter().any(|h| h.field.equiv("Authorization") && h.value.as_str() == format!("Bearer {}", m.token));
    let run = rq.url().strip_prefix("/mcp/").unwrap_or("").to_string();
    if !authed || run.is_empty() {
        return reply(rq, 401, "{}".into());
    }
    if *rq.method() != tiny_http::Method::Post {
        return reply(rq, 405, "{}".into());
    }
    let mut body = String::new();
    if rq.as_reader().read_to_string(&mut body).is_err() {
        return reply(rq, 400, "{}".into());
    }
    let msg: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return reply(rq, 400, "{}".into()),
    };
    let Some(id) = msg.get("id").cloned() else {
        return reply(rq, 202, String::new()); // notification
    };
    let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
    let result = match method {
        "initialize" => Ok(serde_json::json!({
            "protocolVersion": msg.pointer("/params/protocolVersion").cloned().unwrap_or(serde_json::json!("2025-06-18")),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "tracko", "version": env!("CARGO_PKG_VERSION") }
        })),
        "ping" => Ok(serde_json::json!({})),
        "tools/list" => Ok(serde_json::json!({ "tools": m.tools.read().map(|t| t.clone()).unwrap_or_default() })),
        "tools/call" => {
            let call_id = format!("c{}", m.next.fetch_add(1, Ordering::SeqCst));
            let (tx, rx) = std::sync::mpsc::channel();
            m.waiting.lock().unwrap().insert(call_id.clone(), tx);
            let _ = app.emit("tool-call", ToolCall {
                run,
                call_id: call_id.clone(),
                name: msg.pointer("/params/name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                args: msg.pointer("/params/arguments").cloned().unwrap_or(serde_json::json!({})),
            });
            let out = rx.recv_timeout(Duration::from_secs(120)).unwrap_or(("tracko didn't answer in time".into(), true));
            m.waiting.lock().unwrap().remove(&call_id);
            Ok(serde_json::json!({ "content": [{ "type": "text", "text": out.0 }], "isError": out.1 }))
        }
        _ => Err(serde_json::json!({ "code": -32601, "message": format!("Method not found: {method}") })),
    };
    let body = match result {
        Ok(r) => serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err(e) => serde_json::json!({ "jsonrpc": "2.0", "id": id, "error": e }),
    };
    reply(rq, 200, body.to_string());
}

/// Writes a small file (system prompt, MCP config) into the harness folder and returns its path.
/// Passing these as files avoids command-line quoting problems, especially through cmd.exe on Windows.
#[tauri::command]
async fn harness_file(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || "-_.".contains(*c)).collect();
    if safe.is_empty() {
        return Err("bad file name".into());
    }
    let dir = data_dir(&app)?.join("harness-work");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

// ---------- update check (GitHub Releases) ----------
#[derive(Serialize)]
struct Release {
    tag: String,
    url: String,
}

#[tauri::command]
async fn latest_release(http: State<'_, Http>, repo: String) -> Result<Release, String> {
    let ok = repo.split('/').count() == 2 && repo.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c));
    if !ok {
        return Err("Bad repo name".into());
    }
    let res = http.0
        .get(format!("https://api.github.com/repos/{repo}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("GitHub returned {}", res.status()));
    }
    let v: serde_json::Value = serde_json::from_str(&res.text().await.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(Release {
        tag: v["tag_name"].as_str().unwrap_or("").to_string(),
        url: v["html_url"].as_str().unwrap_or("").to_string(),
    })
}

#[derive(Serialize)]
struct McpInfo {
    url: String,
    token: String,
}

#[tauri::command]
fn mcp_info(mcp: State<'_, std::sync::Arc<Mcp>>) -> McpInfo {
    McpInfo { url: format!("http://127.0.0.1:{}/mcp/", mcp.port), token: mcp.token.clone() }
}

#[tauri::command]
fn mcp_set_tools(mcp: State<'_, std::sync::Arc<Mcp>>, tools: serde_json::Value) {
    if let Ok(mut t) = mcp.tools.write() {
        *t = tools;
    }
}

#[tauri::command]
fn tool_result(mcp: State<'_, std::sync::Arc<Mcp>>, call_id: String, text: String, is_error: bool) {
    if let Some(tx) = mcp.waiting.lock().unwrap().remove(&call_id) {
        let _ = tx.send((text, is_error));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http = reqwest::Client::builder()
        .user_agent(concat!("tracko/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .build()
        .expect("HTTP client");

    tauri::Builder::default()
        // Remember size and position, but not the title bar: tracko draws its own.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::DECORATIONS)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Procs::default())
        .manage(Http(http))
        .manage(BackedUp(AtomicBool::new(false)))
        .setup(|app| {
            let mcp = start_mcp(app.handle().clone());
            app.manage(mcp);
            // Windows and Linux use tracko's own title bar. macOS keeps its traffic lights (tauri.macos.conf.json).
            #[cfg(not(target_os = "macos"))]
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_decorations(false);
            }
            #[cfg(target_os = "macos")]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            export_backup,
            api_key_status,
            set_api_key,
            clear_api_key,
            claude_fetch,
            harness_find,
            latest_release,
            harness_file,
            proc_spawn,
            proc_write,
            proc_kill,
            mcp_info,
            mcp_set_tools,
            tool_result
        ])
        .build(tauri::generate_context!())
        .expect("error while building tracko")
        .run(|app, event| {
            // Don't leave harness processes running after tracko quits.
            if let tauri::RunEvent::Exit = event {
                if let Some(procs) = app.try_state::<Procs>() {
                    if let Ok(mut map) = procs.0.try_lock() {
                        for h in map.values_mut() {
                            let _ = h.child.start_kill();
                        }
                    }
                }
            }
        });
}
