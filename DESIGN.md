# tracko design

This is the spec for tracko's look and behavior. Change this file first if anything here changes.

## Colors

Default accent is a soft slate. Users can pick any accent in Settings > Appearance.

| Token | Dark | Light |
|---|---|---|
| `--accent` | `#8794a8` (soft slate) | `#5f6f86` |
| `--accent-ink` (text on accent) | `#0d0f13` | `#ffffff` |
| `--bg` | `#0b0b0c` (near-black) | `#f5f5f3` (warm off-white) |
| `--side` | `#0b0b0c` | `#efefec` |
| `--panel` (cards, chat box) | `#121214` | `#fbfbf9` |
| `--elev` (hover, bubbles) | `#19191c` | `#ebebe8` |
| `--text` | `#d6d6da` (soft off-white) | `#2b2c2f` (dark gray) |
| `--muted` / `--faint` | `#94949c` / `#5f5f67` | `#64666c` / `#9b9da2` |
| `--ok` / `--warn` / `--bad` | `#63b88a` / `#d4a45c` / `#d97b78` | `#2f7d55` / `#a26b22` / `#bf4f48` |

Everything is tuned for comfort rather than maximum contrast. Text is off-white on near-black, or dark gray on off-white, and the status colors are muted. Big filled buttons are avoided, so "New chat" is outlined and pop-up messages are dark cards.

- Heatmap levels mix the accent into `--h0` at 24%, 46%, 72% and 100%. They are never set by hand.
- A custom accent is darkened in light mode until its luminance is 0.2 or less. Text on it is dark when its luminance is above 0.18, white otherwise.
- Accent presets: slate, teal, blue, green, yellow, orange, rose, pink.
- Bucket colors are picked per bucket, from 10 presets or a custom color.
- No purple in any default.

## Icon

- Source: `assets/icon.svg`, called "Stack": a dark tile with three stacked trays (your buckets), the front one checked off. Other options and the old chat-bubble icon are in `assets/icon-options/`.
- Built files: `assets/png/icon-{16..1024}.png`, `assets/icon.png` (512) and `assets/icon.ico`. Make the macOS `.icns` from `icon-1024.png`.
- Inside the app, the two back trays take the current accent color.

## Layout

- Three columns: left sidebar, main view, right Focus panel.
- The left sidebar is 264px by default and drags from 200 to 440px. Dragging it below 140px hides it. Ctrl+B toggles it.
- The Focus panel is 320px by default and drags from 260 to 520px. Ctrl+. toggles it. It opens by default on windows 1280px or wider and is hidden in Settings.
- Double-clicking a drag edge resets it.
- Chat width: Compact is 700px, Wide is 940px (the default), Full is the whole window.
- Below 760px wide, both sidebars become slide-over drawers.

## Screens

1. **Chat.** One chat per thread, grouped under buckets in the sidebar. A new chat starts in Inbox. The agent moves it to a bucket when it is sure, or asks with bucket buttons when it isn't.
2. **Today.** Chats waiting for a bucket, reminders, Look back (yesterday, last Friday, last week, with a copy button), a year heatmap, open tasks.
3. **Bucket.** Chats, open tasks, things to remember, heatmap, timeline.
4. **Settings.** A popup over the current page, not a separate page. Its tabs are General, Usage, Instructions, Memories, Saved prompts, Buckets and Data. Esc or a click outside closes it.
5. **Focus panel.** Today's list (plan tasks with the sun button, carry over unfinished ones, quick add), Up next, From this chat, Remember in (bucket).
6. **Search.** ⌘K or `/` opens a palette over everything, including chats.

## Behavior

- Item types: task, note, done (log). Any task can have a reminder.
- How eagerly the agent asks about buckets: Ask me more, Balanced (default), Ask me less.
- Questions asked in a bucket chat only search that bucket. Saying "everywhere" searches all buckets.
- Memories save from chat on phrases like "I prefer", "my reviewer is", "from now on". Users can turn this off.
- Saved prompts run with `/name` in a chat.
- Reminder pop-ups offer Done, 1 hour and Tomorrow. A morning recap shows yesterday, or last Friday on a Monday.

## Chats and buckets

- **Chat menu.** Open it from the ⋯ button or by right-clicking. It has Rename (inline), Pin to top, Archive and Delete.
- **Archiving a chat** hides it from the sidebar. Undo shows for 5 seconds. Search still finds it, and opening it shows a Restore banner instead of the message box.
- **Bucket menu.** It has New chat here, Open, Settings, Archive and Delete. Inbox only gets the first three.
- **Archiving a bucket** hides it and all its chats, and pauses its reminders, today's list items and pop-ups.
- **Deleting a bucket** asks what to do with its contents: move them to Inbox, or delete everything.
- **Archived page.** It appears in the sidebar once anything is archived, and lists archived chats and buckets with Restore and Delete.

## Usage

- Each reply records the model, input tokens, output tokens and cost. Hover a reply to see them.
- The chat header shows a context meter: tokens in context out of 1M, plus what that chat has cost.
- **Settings > Usage** shows:
  - Today, this week and this month as cost and tokens.
  - A 30-day daily cost bar chart, with a table view.
  - A monthly budget with a warning at 80%.
  - Breakdowns by model and by bucket.
- Prices per 1M tokens: Opus 5.5 $4 in / $20 out, Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50.
- Counts come from each reply, including cached input. Offline-rule replies aren't counted.

## Stack

- **Shell.** Tauri 2. It uses the system web view (WebView2, WKWebView or WebKitGTK), so there's no bundled browser.
- **Connections.** Claude Code and Codex are harnesses: tracko uses your existing sign-in. The Claude API connection uses a key. All three implement one interface in `ui/src/providers.js` (status, models, efforts, reply), show as identical rows in Settings > Connections, and share tracko's tools. Claude Code gets the tools through a local MCP server, Codex through dynamic tools, and the API through tool use. The rest of the UI is provider-neutral. The Agent SDK was dropped because it bundles the ~330 MB Claude Code binary.
- **Effort.** A picker next to the model in the chat box and in Settings. Claude offers low to max, Codex offers whatever each model lists, and low is the default.
- **Requests and key.** Every request goes through Rust, which adds the API key and only allows `api.anthropic.com`. The key lives in the OS credential store.
- **Data.** One JSON file in the app data folder. Writes are atomic, with a `.bak` copy made once per session.
- **Default model.** Opus 5.5 at low effort, with server-side refusal fallback on Opus and Sonnet.
- **Builds.** GitHub Actions builds for Windows x64, macOS arm64 and x64, and Linux x64 and arm64.
