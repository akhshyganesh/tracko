# tracko

A personal tracker you talk to. Type a one-liner, paste a messy paragraph or drop in a screenshot. tracko splits it into tasks, notes and done items, files the chat in the right bucket (or asks you which one), and answers questions like "what did I do last Friday?".

tracko is free and open source under the [MIT license](LICENSE).

It's a small desktop app for Windows, macOS and Linux, built with [Tauri](https://tauri.app). It uses the system's own web view instead of shipping a browser, so the installer is a few MB and idle memory stays low.

## Install

Download the installer for your OS from the [latest release](https://github.com/akhshyganesh/tracko/releases/latest).

The macOS and Windows builds aren't code-signed yet. On macOS, the first launch is blocked; open System Settings > Privacy & Security and click Open Anyway. On Windows, SmartScreen asks you to confirm.

## What's in it

- **Chats grouped by bucket.** A new chat starts in Inbox. Claude moves it when one bucket clearly fits, and asks with buttons when it doesn't.
- **Today.** Due reminders, a look back at yesterday, last Friday and last week (with a copy button for standup or timesheets), a year heatmap, and open tasks.
- **Focus panel.** Today's list, upcoming reminders, and what the current chat saved.
- **Settings.** Model, how often Claude asks about buckets, accent color, chat width, your instructions, memories, default prompts (`/sync` for today, `/standup` for what you did and what is still pending, `/recap` for how the week is going overall or in one bucket, e.g. `/recap Work`), buckets, token usage with a monthly budget, and backups.
- **Archive and delete** for chats and buckets. **Search** with ⌘K / Ctrl+K.

`DESIGN.md` is the spec for layout, colors and behavior.

## Connections

tracko can get replies from any of these. Settings > General > Connections shows each one in the same kind of row, with its status (Connected, Not signed in, Not installed), the account it uses, and a fix when it isn't ready.

| Connection | Sign-in | How tracko talks to it | How tracko's tools get in |
|---|---|---|---|
| **Claude Code** | your Claude Code login (`claude auth login`) | runs `claude -p` once per reply (stream-json) | a local MCP server inside tracko |
| **Codex** | your ChatGPT login through the Codex app | keeps `codex app-server` running (JSON-RPC) | Codex dynamic tools |
| **Claude API** | an Anthropic API key in your keychain | HTTPS through the Rust side | API tool use |

All three use the same tracko tools: `file_items`, `update_items`, `move_chat`, `ask_bucket`, `create_bucket`, `save_memory`, `search_history` and `show_items`.

- **Harnesses run with as little access as each one allows.** Both start in an empty folder. Claude Code runs with its own tools off and skips your personal settings and `CLAUDE.md`. Codex runs in its read-only sandbox. It can't change files, but it can run read-only commands and read any file your account can. tracko only starts programs named exactly `claude` or `codex`. It finds them on your PATH and in the usual install folders, or you can paste a path.
- **The local MCP server** listens on `127.0.0.1` only and needs a random token that changes every launch.
- **Cost.** Harness replies come out of your Claude or ChatGPT plan, so Usage shows their tokens but no dollar cost. API key replies show their cost.
- **Choosing a model and effort.** The model picker lists the models of every connected provider, and picking one also picks the provider. Next to it is the effort picker.

To add another harness, write an adapter like `ui/src/claude-code.js` and add an entry to `ui/src/providers.js`.

tracko never sees your Claude or ChatGPT credentials. It starts the `claude` or `codex` program you already installed and signed in to, on your own machine. Check each provider's terms before you rely on a subscription login in a third-party app. If in doubt, use the Claude API connection with your own key.

## Where your data lives

Everything is in one JSON file on your computer. The first save each session keeps the previous version as `tracko.json.bak`.

| OS | Data file |
|---|---|
| Windows | `%APPDATA%\app.tracko.desktop\tracko.json` |
| macOS | `~/Library/Application Support/app.tracko.desktop/tracko.json` |
| Linux | `~/.local/share/app.tracko.desktop/tracko.json` |

Settings > Data > Save backup writes a copy to your Downloads folder.

## Building from source

You need **Node.js 20+** and **Rust 1.77.2 or newer** (install from [rustup.rs](https://rustup.rs)), plus each OS's build tools:

- **Windows 10/11:** Microsoft C++ Build Tools ("Desktop development with C++"). WebView2 already ships with Windows 10 and 11.
- **macOS 10.15+:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux (Debian/Ubuntu):**
  ```sh
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
    libssl-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev
  ```
  For Fedora, Arch and others, see [Tauri's prerequisites](https://tauri.app/start/prerequisites/).

Then:

```sh
npm install
npm run dev      # run the app with live Rust rebuilds (run `npm run build:ui` after UI changes)
npm run build    # make installers for the OS you're on
```

Installers land in `src-tauri/target/release/bundle/`:

| OS | Output |
|---|---|
| Windows | `.msi` and `.exe` (NSIS) |
| macOS | `.app` and `.dmg` |
| Linux | `.deb`, `.rpm` and `.AppImage` |

### Update checks

The download icon at the bottom of the sidebar checks this repo's GitHub Releases for a newer version, at startup and every 6 hours. It shows a dot when one is out, and clicking it opens the release page. If you fork tracko, point `UPDATE_REPO` in `ui/src/app.js` at your fork, or set it to `''` to turn checks off.

### All three OSes at once

`.github/workflows/build.yml` builds on GitHub's Windows, macOS and Linux machines. It covers macOS on Apple Silicon (Intel Macs aren't built), Windows on x64, and Linux on x64 and ARM.

- Every push to `main` and every pull request builds the installers. Download them from the run's artifacts.
- To get a draft release with every installer, push a tag: `git tag v0.1.0 && git push --tags`.
- To build on demand, run the workflow by hand from the Actions tab.

Signing needs an Apple Developer ID and a Windows code-signing certificate, both added as GitHub secrets. See [Tauri's distribution guide](https://tauri.app/distribute/).

## Project layout

```
ui/index.html        markup and styles
ui/src/app.js        the app: state, views, offline rules, tool handlers
ui/src/agent.js      Claude: requests, tool loop, usage, errors
ui/src/providers.js  every connection behind one shape (status, models, efforts, reply)
ui/src/harness.js    shared harness plumbing: start a program, read lines, answer MCP tool calls
ui/src/claude-code.js Claude Code harness adapter
ui/src/codex.js      Codex harness adapter (JSON-RPC client for codex app-server)
ui/src/tools.js      tracko's tools, shared by every connection
ui/src/bridge.js     calls into the Rust side (files, key, notifications)
scripts/build-ui.mjs bundles ui/ into dist/ with esbuild
src-tauri/           the Rust shell: window, data file, key storage, Claude API proxy, harness runner, local MCP server
assets/              app icon source (SVG) and rendered PNG/ICO files
```

## Contributing

Issues and pull requests are welcome. For a change to layout, colors or behavior, update `DESIGN.md` in the same pull request. Please report security problems privately through [GitHub's security advisories](https://github.com/akhshyganesh/tracko/security/advisories/new) rather than a public issue.

## License

[MIT](LICENSE)
