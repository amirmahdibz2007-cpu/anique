<div align="center">

```
 █████╗ ███╗   ██╗██╗ ██████╗ ██╗   ██╗███████╗
██╔══██╗████╗  ██║██║██╔═══██╗██║   ██║██╔════╝
███████║██╔██╗ ██║██║██║   ██║██║   ██║█████╗
██╔══██║██║╚██╗██║██║██║▄▄ ██║██║   ██║██╔══╝
██║  ██║██║ ╚████║██║╚██████╔╝╚██████╔╝███████╗
╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝
```

# ◆ Anique

**A multi-domain AI agent in your terminal** — Aurora TUI, portable CLI, your own API keys. One core agent. Many lenses.

<br/>

`TypeScript` · `Node 22+` · `Ink TUI` · `SQLite` · `MIT License`

[![License: MIT](https://img.shields.io/badge/License-MIT-66d9ef?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-bb9af7?style=flat-square)](https://github.com/amirmahdibz2007-cpu/anique/pulls)
[![Aurora TUI](https://img.shields.io/badge/UI-Aurora%20TUI-ff79c6?style=flat-square&logo=react&logoColor=white)](https://github.com/vadimdemedes/ink)

</div>

---

**Anique** runs a sharp agent loop in the terminal. Swap **lenses** to change what it's good at — writing, coding, teaching, marketing, bots, systems — or pick the **evolve** lens to make Anique improve itself.

```
 █████╗ ███╗   ██╗██╗ ██████╗ ██╗   ██╗███████╗
██╔══██╗████╗  ██║██║██╔═══██╗██║   ██║██╔════╝
███████║██╔██╗ ██║██║██║   ██║██║   ██║█████╗
██╔══██║██║╚██╗██║██║██║▄▄ ██║██║   ██║██╔══╝
██║  ██║██║ ╚████║██║╚██████╔╝╚██████╔╝███████╗
╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝
               ────────── ◆ ──────────
     your terminal · your memory · your daily driver

╭─ ◆ anique ‹default› ‹code› ⟩ ● act ⟩ claude-sonnet ─╮
│ ⣿⣿⣿⣿⡄⠀⠀ 42% · $0.083 · ⬡a1b2c3d4 · ~/proj     │
╰─────────────────────────────────────────────────────╯
◎ my-app ▸ code ▸ ‹safe›                    ✦ 8 · ready
╭─ ◇ you ─────────────────────────────────────────────╮
│  fix the flaky auth test                            │
╰─────────────────────────────────────────────────────╯
⌕ grep · ◎ read_file · ✎ write_file
╔═ ✦ anique ══════════════════════════════════════════╗
║  3 tests fixed · auth suite green again             ║
╚═════════════════════════════════════════════════════╝
◈ done · 3 tools · 2.1s
╭─────────────────────────────────────────────────────╮
│ ❯ ask anything… ( / for commands )                  │
╰─────────────────────────────────────────────────────╯
```

## ✨ Highlights

| Feature | Description |
|---------|-------------|
| **Aurora TUI** | True-color splash wordmark, gradient brand, pill badges, closed message bubbles, per-tool icons |
| **Agent loop with tools** | File read/write, patch, ripgrep, bash, git, memory, skills, todos — plus a plan-before-act rhythm |
| **Lenses** | Swap domain expertise with one keypress (`/code`, `/write`, `/teach`, …) |
| **Deep missions** | Auto-plan → execute → verify → repair → synthesize for hard tasks |
| **Named projects** | Per-folder memory + chat history (`/project new <name>`) while still using global USER.md |
| **Cheap by design** | Automatic long-history compaction so tokens stay low and sessions never overflow |
| **Safety gates** | Enter = approve once; `u` = unlock session; allowlists, undo + version vault |
| **Multi-provider** | OpenRouter, OpenAI, Ollama, or any OpenAI-compatible endpoint |
| **Bilingual UI** | English / Persian replies (`/fa`, `/en`) — UI stays English |
| **Profiles** | Isolated agent homes (`anique profile create coder`) — configs, skills, memory per profile |

---

## 📦 Install

Requires **Node.js 22+** and `npm`.

```bash
git clone https://github.com/amirmahdibz2007-cpu/anique.git
cd anique
npm install
npm run build
npm link

anique setup     # pick provider + model + your preferences
anique doctor    # sanity check
anique           # open the TUI
```

### Quick start (one-liner)

```bash
npx anique@latest setup && anique
```

### Update (from a GitHub clone)

Memory and skills stay in `~/.anique` — they are not wiped by an update.

**Always update the folder that `anique` actually runs from** (not a random clone):

```bash
SRC="$(dirname "$(dirname "$(readlink -f "$(which anique)")")")"
echo "Updating: $SRC"
cd "$SRC"
git pull
npm install
npm run build
npm link
hash -r
```

Then **fully quit Anique** (close the TUI / terminal tab) and start it again.

Check that it worked:

```bash
anique doctor          # Source root should match $SRC
cd "$SRC" && git log -1 --oneline
```

#### If it still looks unchanged

1. **`git pull` failed or said Already up to date** — repo may be private, or you have no access. You need the repo public (or a collaborator invite) and a successful `git pull` that downloads new commits.
2. **You updated the wrong folder** — `which anique` / `anique doctor` must point at the same path you built.
3. **Old process still running** — quit every Anique window and open a new terminal (`hash -r`).
4. **Installed via npm, not git** — use `npm i -g anique@latest` instead of `git pull`.

---

## 🧭 Lenses

| Lens | Title | Use it for | Switch command |
|------|-------|------------|----------------|
| `code` | **Code** | Repos, edits, tests, git, debug | `/code` |
| `write` | **Write** | Essays, docs, journalism, scripts | `/write` |
| `teach` | **Teach** | Lessons, drills, quizzes, explanations | `/teach` |
| `market` | **Market** | Growth, copy, funnels, calendars | `/market` |
| `bot` | **Bot** | Chatbot / Telegram / agent debugging | `/bot` |
| `system` | **System** | Dotfiles & services (high-friction approvals) | `/system` |
| `evolve` | **Evolve** | Improve Anique's own code & prompts | `/evolve` |
| `daily` | **Daily** | Quick everyday tasks, drafts, checklists | `/daily` |
| `atelier` | **Atelier** | Private deep-coding lens (owner-only) | `/atelier` |

> **My personal taste** lives in **`~/.anique/USER.md`** — edit it or run `anique setup`.

### Lens details

<details>
<summary><b>code</b> — Repository work: edit, test, git, debug</summary>

Tools: `read_file`, `write_file`, `apply_patch`, `grep`, `glob`, `bash`, `git_status`, `git_diff`, `git_commit`, `run_tests`, `project_ingest`, plus memory/skills/todos/recall/web_search.

Best for: refactoring, bug fixes, writing tests, exploring codebases, git workflows.
</details>

<details>
<summary><b>write</b> — Journalism / magazine voice, structure, editing</summary>

Tools: common + `list_templates`, `read_template`.

Templates: `article.md`, `campaign.md`, `lesson.md`.

Best for: articles, documentation, newsletters, scripts, editing passes.
</details>

<details>
<summary><b>teach</b> — Explanations, learning paths, drills, quizzes</summary>

Tools: common + `list_templates`, `read_template`.

Template: `lesson.md` (intuition → precise idea → worked example → practice → mini-quiz).

Best for: learning new topics, creating study materials, tutoring.
</details>

<details>
<summary><b>market</b> — Bot growth: copy, funnels, content calendar</summary>

Tools: common + `list_templates`, `read_template`.

Template: `campaign.md`.

Best for: launch copy, A/B variants, content calendars, funnel maps.
</details>

<details>
<summary><b>bot</b> — Debug and improve your bot from logs and code</summary>

Tools: common + `read_log`, `git_status`, `git_diff`, `run_tests`.

Best for: Telegram/Discord bot debugging, handler fixes, flow design.
</details>

<details>
<summary><b>system</b> — Rice, configs, services — high-friction approvals</summary>

Tools: common tools only (no git_commit, no run_tests by default).

Best for: dotfiles, systemd services, package configs, reversible changes.
</details>

<details>
<summary><b>evolve</b> — Self-upgrade: read/change Anique's own code, lenses, UX</summary>

Tools: common + `git_status`, `git_diff`, `git_commit`, `run_tests`, `rebuild_anique`.

Workspace locks to Anique source. After changes: `rebuild_anique` → restart.
</details>

<details>
<summary><b>daily</b> — Light everyday assistant for simple, routine tasks</summary>

Tools: read/write/grep/glob/bash + memory/skills/todos/recall.

Best for: quick answers, drafts, checklists, translations, small lookups.
</details>

<details>
<summary><b>atelier</b> — Private deep-coding lens (not public default)</summary>

Activated via `/atelier` or `/ingest`. Learns your repo permanently into `~/.anique/private/`.

Best for: deep work on your own projects, durable project memory.
</details>

---

## ⚡ Quick Usage

### Interactive modes

```bash
anique                              # TUI (default)
anique tui -l write                 # TUI in write lens
anique repl --classic               # Plain readline REPL
anique repl -l code --plan          # REPL in plan rhythm
```

### One-shot commands

```bash
anique ask -l code "why is CI red?"           # one-shot question
anique mission -l bot "refactor auth"        # live theater timeline
anique resume                                 # resume last session in TUI
anique resume <session-id>                    # resume specific session
anique export                                 # export latest session to markdown
anique export <session-id>                    # export specific session
```

### Self-improvement

```bash
anique evolve --plan "add a new tool for X"   # self-improvement pass
anique evolve                                 # open evolve TUI
anique lenses-reset                           # restore shipped lenses
```

### Provider / Model config

```bash
anique models                                 # interactive wizard (Hermes-style)
anique models <model-id>                      # quick-switch model
anique models +                               # add another provider
anique models --list                          # list models from current provider
anique config set provider openrouter
anique config set provider ollama
anique config set model llama3.2
anique config show                            # show config (API key masked)
```

### Profiles (isolated homes)

```bash
anique profile list                           # list profiles
anique profile create coder --clone           # new profile, clone from default
anique profile use coder                      # set default profile
anique -p coder repl                          # run with specific profile
anique profile delete coder --yes             # delete profile
anique profile rename coder hacker            # rename profile
```

### Memory & Skills

```bash
anique memory                                 # show USER.md + MEMORY.md
anique memory --set "new content"             # overwrite USER.md
anique memory memory --set "note"             # append to MEMORY.md
anique skills                                 # list skills for current lens
anique skills code                            # list skills for code lens
anique skill-save code "my-skill" "content"   # save a skill
```

### Named projects (own memory + chat history per folder)

Lighter than `anique profile` / `anique project init` (which switch the *entire*
ANIQUE_HOME — provider, model, API key, everything). A **named project** just
groups one or more directories under a distinctive name so they share their
own durable memory and chat history, while still inheriting the default
`USER.md` / `MEMORY.md` on every turn.

```bash
anique projects new "Aurora"                  # bind cwd to a new named project
anique projects bind "Aurora"                 # bind cwd to an existing project
anique projects rename "Aurora Redux"         # rename the project bound to cwd
anique projects unbind                        # detach cwd (falls back to per-path memory)
anique projects status                        # show project + bound dirs for cwd
anique projects list                          # list every named project
```

Inside the TUI/REPL, use `/project` (see Slash Commands below). Creating a
project migrates any pre-existing per-folder memory into the named store, and
resume-last / `/sessions` group chat history across every directory bound to
that project.

### Session management

```bash
anique sessions                               # list recent sessions
anique trace                                  # replay latest mission trace
anique trace <session-id>                     # replay specific trace
anique recall "auth bug"                      # search past sessions
```

### Config

```bash
anique config show                            # show all config (key masked)
anique config set approvalMode suggest        # suggest | allowlist | auto
anique config set maxSteps 60
anique config set ui tui                      # tui | classic
anique config set locale fa                   # en | fa (reply language)
```

### Workspace init

```bash
anique init-workspace                         # write starter ANIQUE.md
```

---

## 🎮 Slash Commands (inside TUI / REPL)

| Command | Description |
|---------|-------------|
| `/help` | Show this help |
| `/models` | Configure provider + API key + model |
| `/models <id>` | Quick-switch model |
| `/models +` | Add another provider / API key |
| `/deep <prompt>` | Force quality path (clarify + plan + sequential tasks) |
| `/fast <prompt>` | Skip deep — single-pass answer |
| `/profile` | List agent profiles · `/profile use <name>` |
| `/lens <name>` | Switch lens |
| `/atelier` | Private deep-coding lens |
| `/ingest [deep]` | Scan workspace into durable project memory |
| `/plan` / `/act` | Rhythm: investigate vs execute |
| `/cost` | Session token / $ estimate |
| `/context` | Context window bar |
| `/compact` | Summarize older history to free context |
| `/todos` | Show mission todos |
| `/undo` | Revert last agent file changes (git) |
| `/permissions` | `suggest` \| `allowlist` \| `auto` |
| `/trace` / `/sessions` / `/resume` / `/export` | Session tools |
| `/skill save <name>` | Save last assistant reply as skill |
| `/evolve` | Enter evolve mode (workspace locks to Anique source) |
| `/learn` | Propose learnings from last mission (LearnCard) |
| `/learn on\|off` | Sticky auto-learn after missions |
| `/fa` / `/en` | Persian / English replies (UI stays English). `/fa` does not force the inbox editor. |
| `/compose` / `/send` | Edit `~/.anique/inbox.md` in GUI editor, then send. `/compose watch` auto-sends on save. |
| `/private` | Owner careful profile (not public default) |
| `/versions` | List prior file versions · `/rollback <id>` |
| `/redo` | Preview last message into prompt for edit; `/redo!` resends unchanged |
| `/memory` | Show USER.md / MEMORY.md |
| `/project` | Status of the named project bound to this folder |
| `/project new <name>` | Give this folder its own memory + chat history (plus default memory) |
| `/project bind <name>` / `rename <name>` / `unbind` / `list` | Manage named projects |
| `/config` | Show current config |
| `/clear` | Clear history |

---

## 🛡 Safety & Approvals

Anique classifies every tool call by **risk level**:

| Risk Level | Examples | Default Behavior |
|------------|----------|------------------|
| `safe` | `read_file`, `grep`, `glob`, `memory_read`, `recall`, `skill_load` | Auto-approved |
| `workspace_write` | `write_file`, `apply_patch`, `bash` (non-destructive), `git_commit`, `run_tests` | Prompt once per session |
| `dangerous` | `bash` with `sudo`, `rm -rf`, disk formatters, blind `curl \| sh` | Always prompt |

### Approval modes (`anique config set approvalMode <mode>`)

| Mode | Behavior |
|------|----------|
| `suggest` | Ask for each risky action (default) |
| `allowlist` | Auto-approve safe bash prefixes (`git`, `npm`, `ls`, `cat`, …); prompt for others |
| `auto` | No prompts — fully autonomous (use with caution) |

### Safety features

- **Session unlock**: `Enter`/`y` approves the action **once**; press `u` to unlock the whole session for that risk class
- **Workspace allow**: Persistent allowlist per workspace
- **Undo + Version vault**: Every prior file version saved before edit — `/undo` or `/rollback <id>`
- **API keys**: Stored in `~/.anique/config.json` (mode `600`), never in the repo
- **Plan rhythm**: In `/plan`, `bash`, `git_commit`, `run_tests`, `rebuild_anique` are blocked

---

## 🔧 Development

```bash
npm run typecheck   # TypeScript type-check
npm run smoke       # offline sanity checks (9 lenses, safety, prompts)
npm run regress:daily # focused regressions (approval, retries, projects, slash parity)
npm run e2e         # end-to-end approval behavior tests
npm run build       # compile to dist/
npm run anique -- … # run from source (tsx)
```

### Project structure

```
src/
├── agent/          # Agent loop, deep missions, todos, undo, usage
├── cli/            # Commands: setup, doctor, models, seed
├── compose/        # Inbox (external editor → send)
├── config/         # Config loading, provider presets, paths
├── i18n/           # Persian terminal shaping
├── learn/          # Evidence-gated learning, project memory, skills
├── lenses/         # Lens registry, private lenses
├── memory/         # USER.md / MEMORY.md file ops
├── meta/           # Source root detection
├── profiles/       # Isolated agent profiles (Hermes-style)
├── providers/      # OpenAI-compatible streaming, model fetching
├── safety/         # Approval gates, risk classification
├── skills/         # Skill load/save per lens
├── store/          # SQLite sessions, traces, recall
├── theater/        # Mission theater timeline
├── tools/          # Tool registry + 25+ tool handlers
├── tui/            # Ink TUI components, theme, hooks
└── versions/       # File version vault (undo/rollback)
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `ANIQUE_HOME` | Override `~/.anique` data directory |
| `ANIQUE_SOURCE` | Override Anique source root (for evolve) |

---

## 🌐 Providers

| Provider | Base URL | Default Model | API Key Required |
|----------|----------|---------------|------------------|
| **OpenRouter** | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4` | Yes |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4.1` | Yes |
| **Anthropic** | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` | Yes |
| **Ollama** | `http://127.0.0.1:11434/v1` | `llama3.2` | No (local) |
| **Custom** | Your `baseUrl` | Your choice | Optional |

Configure via `anique models` or `anique config set provider <name>`.

---

## 📚 Templates

Templates live in `~/.anique/templates/` (user) and `templates/` (shipped).

| Template | Lens | Purpose |
|----------|------|---------|
| `article.md` | write | Journalism structure: lead, nut graf, sections, pull-quotes, TL;DR |
| `campaign.md` | market | Growth campaign: hypothesis, copy variants, calendar, metrics |
| `lesson.md` | teach | Lesson sheet: intuition, precise idea, worked example, practice, quiz |
| `bot-incident.md` | bot | Incident report: symptoms, root cause, fix, verification checklist |

Use `list_templates` / `read_template` tools or `/compose` to edit.

---

## 🧠 Learning System

Anique learns from missions via **evidence-gated LearnCards**:

1. After a mission with ≥4 tool calls, `/learn` proposes a skill
2. Evidence pack: tool success rate, verification outcome, session summary
3. If evidence is strong → skill saved to `~/.anique/skills/<lens>/`
4. Next session: `skill_load` makes the approach reusable

```bash
/learn              # propose from last mission
/learn on           # auto-propose after every mission
/learn off          # disable auto-learn
```

---

## 🎨 TUI Features

- **Aurora splash**: Big Unicode wordmark on boot (gradient cyan → violet → pink), then fades into the session
- **Cursor-like layout**: Gradient header, mission strip, feed, status bar, rounded prompt
- **Message bubbles**: Closed boxes for you (`╭╮`) and Anique (`╔╗`), per-tool icons (⌕ grep, ✎ write, ❱ bash, …)
- **Scrolling**: `↑/↓` line (empty prompt), `PgUp/PgDn` page, `Shift|Alt|Ctrl+↑/↓` fast, `Home`/`End` ends. Feed keeps up to 800 items; scroll position is preserved while streaming if you scrolled up.
- **Live context bar**: Braille meter with threshold colors (green → amber → red)
- **Mission theater**: Timeline of tool calls, approvals, reasoning
- **Theme**: True-color Aurora palette in `src/tui/theme.ts` (hex → chalk truecolor)

---

## 📄 License

[MIT](LICENSE) — free for personal and commercial use.

---

## 🤝 Contributing

PRs welcome! Please:

1. Run `npm run typecheck` and `npm run smoke` before pushing
2. Follow existing code style (small modules, explicit types)
3. Update relevant lens markdown if behavior changes
4. Add tests for new tools/commands

---

## 🤖 AI-assisted

Anique was **written by humans**, with AI used as a helper for coding, design iteration, and docs — not as the sole author. Review the code yourself; treat it like any other open-source project.

---

<div align="center">

**Made with ❤️ for terminal dwellers who want a sharp, portable agent.**

</div>

---

# ◆ Anique (فارسی)

```
 █████╗ ███╗   ██╗██╗ ██████╗ ██╗   ██╗███████╗
██╔══██╗████╗  ██║██║██╔═══██╗██║   ██║██╔════╝
███████║██╔██╗ ██║██║██║   ██║██║   ██║█████╗
██╔══██║██║╚██╗██║██║██║▄▄ ██║██║   ██║██╔══╝
██║  ██║██║ ╚████║██║╚██████╔╝╚██████╔╝███████╗
╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝
```

**یک عامل هوش مصنوعی چند دامنه در ترمینال** — TUI با تم Aurora، CLI قابل حمل، و کلیدهای API شخصی. یک هسته. چندین لنز.

<br/>

`TypeScript` · `Node 22+` · `Ink TUI` · `SQLite` · `مجوز MIT`

[![License: MIT](https://img.shields.io/badge/License-MIT-66d9ef?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-bb9af7?style=flat-square)](https://github.com/amirmahdibz2007-cpu/anique/pulls)
[![Aurora TUI](https://img.shields.io/badge/UI-Aurora%20TUI-ff79c6?style=flat-square&logo=react&logoColor=white)](https://github.com/vadimdemedes/ink)

---

**Anique** یک حلقه عامل (agent loop) تیز در ترمینال اجرا می‌کند. **لنزها** را عوض کنید تا تخصص دامنه تغییر کند — نوشتن، کدنویسی، تدریس، بازاریابی، ربات‌ها، سیستم‌ها — یا لنز **evolve** را انتخاب کنید تا Anique خودش را بهبود بخشد.

```
 █████╗ ███╗   ██╗██╗ ██████╗ ██╗   ██╗███████╗
██╔══██╗████╗  ██║██║██╔═══██╗██║   ██║██╔════╝
███████║██╔██╗ ██║██║██║   ██║██║   ██║█████╗
██╔══██║██║╚██╗██║██║██║▄▄ ██║██║   ██║██╔══╝
██║  ██║██║ ╚████║██║╚██████╔╝╚██████╔╝███████╗
╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝
               ────────── ◆ ──────────
     your terminal · your memory · your daily driver

╭─ ◆ anique ‹default› ‹code› ⟩ ● act ⟩ claude-sonnet ─╮
│ ⣿⣿⣿⣿⡄⠀⠀ 42% · $0.083 · ⬡a1b2c3d4 · ~/proj     │
╰─────────────────────────────────────────────────────╯
◎ my-app ▸ code ▸ ‹safe›                    ✦ 8 · ready
╭─ ◇ you ─────────────────────────────────────────────╮
│  تست احراز هویت رو درست کن                          │
╰─────────────────────────────────────────────────────╯
⌕ grep · ◎ read_file · ✎ write_file
╔═ ✦ anique ══════════════════════════════════════════╗
║  ۳ تست درست شد · مجموعهٔ auth دوباره سبز است        ║
╚═════════════════════════════════════════════════════╝
◈ done · 3 tools · 2.1s
╭─────────────────────────────────────────────────────╮
│ ❯ ask anything… ( / for commands )                  │
╰─────────────────────────────────────────────────────╯
```

## ✨ ویژگی‌های برجسته

| ویژگی | توضیح |
|---------|-------|
| **Aurora TUI** | اسپلش یونیکد، لوگوی گرادیانی، نشان‌های کپسولی، حباب پیام بسته، آیکون مخصوص هر ابزار |
| **حلقه عامل با ابزارها** | خواندن/نوشتن فایل، پچ، ripgrep، bash، git، حافظه، مهارت‌ها، todoها — به علاوه ریتم plan-before-act |
| **لنزها** | تغییر تخصص دامنه با یک فشردن کلید (`/code`، `/write`، `/teach`، …) |
| **مأموریت‌های عمیق** | برنامه‌ریزی خودکار → اجرا → تأیید → تعمیر → ترکیب برای کارهای سخت |
| **پروژه‌های نام‌دار** | حافظه و تاریخچهٔ چت جدا برای هر پوشه با `/project new <name>` + حافظهٔ پیش‌فرض |
| **ارزان به‌طراحی** | فشرده‌سازی خودکار تاریخچهٔ طولانی تا توکن‌ها کم بمانند و جلسه‌ها هرگز پر نشوند |
| **دروازه‌های ایمنی** | Enter = تأیید یک‌بار؛ `u` = باز کردن قفل جلسه؛ لیست‌های مجاز، undo + مخزن نسخه‌ها |
| **چند ارائه‌دهنده** | OpenRouter، OpenAI، Ollama، یا هر نقطهٔ پایانی سازگار با OpenAI |
| **رابط دوزبانه** | پاسخ‌های انگلیسی / فارسی (`/fa`، `/en`) — خودِ UI انگلیسی می‌ماند |
| **پروفایل‌ها** | خانه‌های جداگانهٔ عامل (`anique profile create coder`) — کانفیگ، مهارت و حافظه برای هر پروفایل |

---

## 📦 نصب

نیاز به **Node.js 22+** و `npm` دارد.

```bash
git clone https://github.com/amirmahdibz2007-cpu/anique.git
cd anique
npm install
npm run build
npm link

anique setup     # انتخاب ارائه‌دهنده + مدل + ترجیحات شما
anique doctor    # بررسی سلامت
anique           # باز کردن TUI
```

### شروع سریع (یک خطی)

```bash
npx anique@latest setup && anique
```

### آپدیت (از کلون GitHub)

حافظه و مهارت‌ها در `~/.anique` می‌مانند — با آپدیت پاک نمی‌شوند.

**همیشه همان فولدری را آپدیت کن که `anique` واقعاً از آن اجرا می‌شود** (نه یک کلون تصادفی):

```bash
SRC="$(dirname "$(dirname "$(readlink -f "$(which anique)")")")"
echo "Updating: $SRC"
cd "$SRC"
git pull
npm install
npm run build
npm link
hash -r
```

بعد **Anique را کامل ببند** (TUI / تب ترمینال) و دوباره باز کن.

برای اطمینان:

```bash
anique doctor          # Source root باید همان $SRC باشد
cd "$SRC" && git log -1 --oneline
```

#### اگر هنوز آپدیت نشده

1. **`git pull` خطا داد یا Already up to date زد** — ریپو ممکن است private باشد یا دسترسی نداشته باشی. ریپو باید public باشد (یا collaborator باشی) و `git pull` واقعاً کامیت‌های جدید را بگیرد.
2. **فولدر اشتباه را آپدیت کردی** — مسیر `which anique` / `anique doctor` باید همان جایی باشد که `build` زدی.
3. **پروسه‌ی قدیمی هنوز باز است** — همهٔ پنجره‌های Anique را ببند و ترمینال جدید باز کن (`hash -r`).
4. **با npm نصب کرده، نه از git** — به‌جای `git pull` از `npm i -g anique@latest` استفاده کن.

---

## 🧭 لنزها

| لنز | عنوان | کاربرد | دستور تغییر |
|------|-------|--------|-------------|
| `code` | **Code** | مخازن، ویرایش، تست، git، دیباگ | `/code` |
| `write` | **Write** | مقاله، مستندات، روزنامه‌نگاری، اسکریپت | `/write` |
| `teach` | **Teach** | درس، تمرین، آزمونک، توضیح | `/teach` |
| `market` | **Market** | رشد، کپی، قیف، تقویم | `/market` |
| `bot` | **Bot** | دیباگ چت‌بات / تلگرام / عامل | `/bot` |
| `system` | **System** | دات‌فایل‌ها و سرویس‌ها (تأییدات با اصطکاک بالا) | `/system` |
| `evolve` | **Evolve** | بهبود کد و پرامپت‌های خود Anique | `/evolve` |
| `daily` | **Daily** | کارهای روزمره سریع، پیش‌نویس، چک‌لیست | `/daily` |
| `atelier` | **Atelier** | لنز کدنویسی عمیق خصوصی (فقط مالک) | `/atelier` |

> **سلیقهٔ شخصی من** در **`~/.anique/USER.md`** است — آن را ویرایش کنید یا `anique setup` را اجرا کنید.

### جزئیات لنزها

<details>
<summary><b>code</b> — کار روی مخزن: ویرایش، تست، git، دیباگ</summary>

ابزارها: `read_file`، `write_file`، `apply_patch`، `grep`، `glob`، `bash`، `git_status`، `git_diff`، `git_commit`، `run_tests`، `project_ingest`، به علاوه memory/skills/todos/recall/web_search.

مناسب برای: بازآرایی کد، رفع باگ، نوشتن تست، کاوش کدبیس، گردش‌کار git.
</details>

<details>
<summary><b>write</b> — لحن روزنامه‌نگاری / مجله، ساختار، ویرایش</summary>

ابزارها: عمومی + `list_templates`، `read_template`.

قالب‌ها: `article.md`، `campaign.md`، `lesson.md`.

مناسب برای: مقاله‌ها، مستندات، خبرنامه‌ها، اسکریپت‌ها، دورهای ویرایش.
</details>

<details>
<summary><b>teach</b> — توضیح، مسیر یادگیری، تمرین، آزمونک</summary>

ابزارها: عمومی + `list_templates`، `read_template`.

قالب: `lesson.md` (شهود → ایدهٔ دقیق → مثال حل‌شده → تمرین → آزمونک کوتاه).

مناسب برای: یادگیری موضوعات جدید، ایجاد مواد آموزشی، تدریس خصوصی.
</details>

<details>
<summary><b>market</b> — رشد بات: کپی، قیف، تقویم محتوا</summary>

ابزارها: عمومی + `list_templates`، `read_template`.

قالب: `campaign.md`.

مناسب برای: کپی راه‌اندازی، متغیرهای A/B، تقویم محتوا، نقشه قیف.
</details>

<details>
<summary><b>bot</b> — دیباگ و بهبود بات از لاگ‌ها و کد</summary>

ابزارها: عمومی + `read_log`، `git_status`، `git_diff`، `run_tests`.

مناسب برای: دیباگ بات تلگرام/دیسکورد، رفع هندلرها، طراحی جریان.
</details>

<details>
<summary><b>system</b> — شخصی‌سازی سیستم (ricing)، کانفیگ‌ها، سرویس‌ها — تأییدات با اصطکاک بالا</summary>

ابزارها: فقط ابزارهای عمومی (به طور پیش‌فرض git_commit، run_tests ندارند).

مناسب برای: دات‌فایل‌ها، سرویس‌های systemd، کانفیگ پکیج‌ها، تغییرات قابل بازگشت.
</details>

<details>
<summary><b>evolve</b> — ارتقای خود: خواندن/تغییر کد، لنزها، UX خود Anique</summary>

ابزارها: عمومی + `git_status`، `git_diff`، `git_commit`، `run_tests`، `rebuild_anique`.

فضای کار روی کد منبع Anique قفل می‌شود. بعد از تغییرات: `rebuild_anique` → ریستارت.
</details>

<details>
<summary><b>daily</b> — دستیار روزمره سبک برای کارهای ساده روتین</summary>

ابزارها: read/write/grep/glob/bash + memory/skills/todos/recall.

مناسب برای: پاسخ‌های سریع، پیش‌نویس‌ها، چک‌لیست‌ها، ترجمه، جستجوی کوچک.
</details>

<details>
<summary><b>atelier</b> — لنز کدنویسی عمیق خصوصی (پیش‌فرض عمومی نیست)</summary>

فعال می‌شود از طریق `/atelier` یا `/ingest`. مخزن شما را به طور دائم در `~/.anique/private/` یاد می‌گیرد.

مناسب برای: کار عمیق روی پروژه‌های خودتان، حافظه پروژه ماندگار.
</details>

---

## ⚡ استفاده سریع

### حالت‌های تعاملی

```bash
anique                              # TUI (پیش‌فرض)
anique tui -l write                 # TUI در لنز write
anique repl --classic               # REPL ساده readline
anique repl -l code --plan          # REPL در ریتم plan
```

### دستورات تک‌خطی

```bash
anique ask -l code "why is CI red?"           # سوال تک‌خطی
anique mission -l bot "refactor auth"         # خط‌زمان زندهٔ تئاتر مأموریت
anique resume                                 # ادامه آخرین جلسه در TUI
anique resume <session-id>                    # ادامه جلسه خاص
anique export                                 # صادرات آخرین جلسه به markdown
anique export <session-id>                    # صادرات جلسه خاص
```

### ارتقای خود

```bash
anique evolve --plan "add a new tool for X"   # یک دور ارتقای خود
anique evolve                                 # باز کردن TUI evolve
anique lenses-reset                           # بازگردانی لنزهای پیش‌فرض
```

### کانفیگ ارائه‌دهنده / مدل

```bash
anique models                                 # ویزارد تعاملی (سبک Hermes)
anique models <model-id>                      # تغییر سریع مدل
anique models +                               # افزودن ارائه‌دهنده دیگر
anique models --list                          # لیست مدل‌های ارائه‌دهنده فعلی
anique config set provider openrouter
anique config set provider ollama
anique config set model llama3.2
anique config show                            # نمایش کانفیگ (کلید API ماسک شده)
```

### پروفایل‌ها (خانه‌های جدا شده)

```bash
anique profile list                           # لیست پروفایل‌ها
anique profile create coder --clone           # پروفایل جدید، کپی از پیش‌فرض
anique profile use coder                      # تنظیم پروفایل پیش‌فرض
anique -p coder repl                          # اجرا با پروفایل خاص
anique profile delete coder --yes             # حذف پروفایل
anique profile rename coder hacker            # تغییر نام پروفایل
```

### حافظه و مهارت‌ها

```bash
anique memory                                 # نمایش USER.md + MEMORY.md
anique memory --set "new content"             # بازنویسی USER.md
anique memory memory --set "note"             # الحاق به MEMORY.md
anique skills                                 # لیست مهارت‌ها برای لنز فعلی
anique skills code                            # لیست مهارت‌ها برای لنز code
anique skill-save code "my-skill" "content"   # ذخیره مهارت
```

### پروژه‌های نام‌دار (حافظه و تاریخچهٔ چت برای هر پوشه)

سبک‌تر از `anique profile` / `anique project init` (که کل `ANIQUE_HOME` را عوض می‌کنند — ارائه‌دهنده، مدل، کلید API و همه‌چیز). یک **پروژهٔ نام‌دار** فقط یک یا چند پوشه را زیر یک اسم مشخص گروه می‌کند تا حافظه و تاریخچهٔ چت مشترک داشته باشند، و در عین حال همچنان `USER.md` / `MEMORY.md` پیش‌فرض را در هر نوبت به ارث می‌برند.

```bash
anique projects new "Aurora"                  # اتصال cwd به پروژهٔ نام‌دار جدید
anique projects bind "Aurora"                 # اتصال cwd به یک پروژهٔ موجود
anique projects rename "Aurora Redux"         # تغییر نام پروژهٔ متصل به cwd
anique projects unbind                        # جدا کردن cwd (برگشت به حافظهٔ per-path)
anique projects status                        # نمایش پروژه و پوشه‌های متصل برای cwd
anique projects list                          # لیست همهٔ پروژه‌های نام‌دار
```

داخل TUI/REPL از `/project` استفاده کنید. ساخت پروژه، حافظهٔ قبلی همان پوشه (در صورت وجود) را به ذخیره‌گاه نام‌دار منتقل می‌کند، و resume-last / `/sessions` تاریخچه را بین همهٔ پوشه‌های متصل به آن پروژه گروه می‌کند.

### مدیریت جلسه

```bash
anique sessions                               # لیست جلسات اخیر
anique trace                                  # پخش مجدد خط زمان مأموریت
anique trace <session-id>                     # پخش مجدد خط زمان خاص
anique recall "auth bug"                      # جستجو در جلسات گذشته
```

### کانفیگ

```bash
anique config show                            # نمایش کل کانفیگ (کلید ماسک شده)
anique config set approvalMode suggest        # suggest | allowlist | auto
anique config set maxSteps 60
anique config set ui tui                      # tui | classic
anique config set locale fa                   # en | fa (زبان پاسخ)
```

### راه‌اندازی فضای کار

```bash
anique init-workspace                         # نوشتن ANIQUE.md استارت
```

---

## 🎮 دستورات اسلش (درون TUI / REPL)

| دستور | توضیح |
|---------|-------------|
| `/help` | نمایش این راهنما |
| `/models` | کانفیگ ارائه‌دهنده + کلید API + مدل |
| `/models <id>` | تغییر سریع مدل |
| `/models +` | افزودن ارائه‌دهنده / کلید API دیگر |
| `/deep <prompt>` | اجبار مسیر کیفیت (سؤال شفاف‌سازی + برنامه + وظایف ترتیبی) |
| `/fast <prompt>` | رد کردن deep — پاسخ یک‌مرحله‌ای |
| `/profile` | لیست پروفایل‌های عامل · `/profile use <name>` |
| `/lens <name>` | تغییر لنز |
| `/atelier` | لنز کدنویسی عمیق خصوصی |
| `/ingest [deep]` | اسکن فضای کار به حافظه پروژه ماندگار |
| `/plan` / `/act` | ریتم: کاوش در برابر اجرا |
| `/cost` | تخمین توکن / $ جلسه |
| `/context` | نوار پنجرهٔ زمینه (context) |
| `/compact` | خلاصه‌سازی تاریخچهٔ قدیمی برای آزاد کردن زمینه |
| `/todos` | نمایش todoهای مأموریت |
| `/undo` | برگرداندن آخرین تغییرات فایل عامل (git) |
| `/permissions` | `suggest` \| `allowlist` \| `auto` |
| `/trace` / `/sessions` / `/resume` / `/export` | ابزارهای جلسه |
| `/skill save <name>` | ذخیرهٔ آخرین پاسخ عامل به‌عنوان مهارت |
| `/evolve` | ورود به حالت evolve (فضای کار روی منبع Anique قفل می‌شود) |
| `/learn` | پیشنهاد یادگیری از آخرین مأموریت (LearnCard) |
| `/learn on\|off` | یادگیری خودکار پایدار بعد از مأموریت‌ها |
| `/fa` / `/en` | پاسخ‌های فارسی / انگلیسی (UI انگلیسی می‌ماند). `/fa` ویرایشگر اینباکس را اجباری نمی‌کند. |
| `/compose` / `/send` | ویرایش `~/.anique/inbox.md` در ویرایشگر GUI، سپس ارسال. `/compose watch` با ذخیره خودکار می‌فرستد. |
| `/private` | پروفایل محتاط مالک (پیش‌فرض عمومی نیست) |
| `/versions` | لیست نسخه‌های قبلی فایل · `/rollback <id>` |
| `/redo` | پیش‌نمایش آخرین پیام در پرامپت برای ویرایش؛ `/redo!` بدون تغییر دوباره می‌فرستد |
| `/memory` | نمایش USER.md / MEMORY.md |
| `/project` | وضعیت پروژهٔ نام‌دار متصل به این پوشه |
| `/project new <name>` | به این پوشه حافظه و تاریخچهٔ چت خودش بده (به‌علاوه حافظهٔ پیش‌فرض) |
| `/project bind <name>` / `rename <name>` / `unbind` / `list` | مدیریت پروژه‌های نام‌دار |
| `/config` | نمایش کانفیگ فعلی |
| `/clear` | پاک کردن تاریخچه |

---

## 🛡 ایمنی و تأییدات

Anique هر فراخوانی ابزار را بر اساس **سطح ریسک** طبقه‌بندی می‌کند:

| سطح ریسک | مثال‌ها | رفتار پیش‌فرض |
|-----------|---------|----------------|
| `safe` | `read_file`، `grep`، `glob`، `memory_read`، `recall`، `skill_load` | تأیید خودکار |
| `workspace_write` | `write_file`، `apply_patch`، `bash` (غیرمخرب)، `git_commit`، `run_tests` | پرامپت یک بار در جلسه |
| `dangerous` | `bash` با `sudo`، `rm -rf`، فرمت‌دهنده دیسک، `curl \| sh` کور | همیشه پرامپت |

### حالت‌های تأیید (`anique config set approvalMode <mode>`)

| حالت | رفتار |
|------|--------|
| `suggest` | برای هر اقدام ریسک‌دار بپرس (پیش‌فرض) |
| `allowlist` | پیشوندهای bash امن (`git`، `npm`، `ls`، `cat`، …) را خودکار تأیید می‌کند؛ بقیه را می‌پرسد |
| `auto` | بدون پرامپت — کاملاً خودمختار (با احتیاط استفاده کنید) |

### ویژگی‌های ایمنی

- **تأیید یک‌بار**: `Enter`/`y` فقط همان اقدام را تأیید می‌کند؛ برای باز کردن قفل کل جلسه کلید `u` را بزنید
- **مجاز فضای کار**: لیست مجاز ماندگار به‌ازای هر فضای کار
- **Undo + مخزن نسخه**: هر نسخهٔ قبلی فایل قبل از ویرایش ذخیره می‌شود — `/undo` یا `/rollback <id>`
- **کلیدهای API**: در `~/.anique/config.json` (حالت `600`) ذخیره می‌شوند، هرگز در مخزن نیستند
- **ریتم plan**: در `/plan`، `bash`، `git_commit`، `run_tests`، `rebuild_anique` مسدود هستند

---

## 🔧 توسعه

```bash
npm run typecheck   # بررسی نوع TypeScript
npm run smoke       # بررسی‌های آفلاین (۹ لنز، ایمنی، پرامپت‌ها)
npm run regress:daily # رگرسیون متمرکز (تأیید، retry، پروژه، parity اسلش)
npm run e2e         # تست‌های end-to-end رفتار تأیید
npm run build       # کامپایل به dist/
npm run anique -- … # اجرا از منبع (tsx)
```

### ساختار پروژه

```
src/
├── agent/          # حلقه عامل، مأموریت‌های عمیق، todoها، undo، usage
├── cli/            # دستورات: setup، doctor، models، seed
├── compose/        # Inbox (ویرایشگر خارجی → ارسال)
├── config/         # بارگذاری کانفیگ، پیش‌فرض‌های ارائه‌دهنده، مسیرها
├── i18n/           # شکل‌دهی فارسی ترمینال
├── learn/          # یادگیری مبتنی بر شواهد، حافظهٔ پروژه، مهارت‌ها
├── lenses/         # رجیستری لنز، لنزهای خصوصی
├── memory/         # عملیات فایل USER.md / MEMORY.md
├── meta/           # تشخیص ریشه منبع
├── profiles/       # پروفایل‌های جدا شده عامل (سبک Hermes)
├── providers/      # استریمینگ سازگار OpenAI، واکشی مدل
├── safety/         # دروازه‌های تأیید، طبقه‌بندی ریسک
├── skills/         # بارگذاری/ذخیره مهارت به ازای هر لنز
├── store/          # جلسات SQLite، خط زمان‌ها، recall
├── theater/        # تئاتر مأموریت خط زمان
├── tools/          # رجیستری ابزار + ۲۵+ هندلر ابزار
├── tui/            # کامپوننت‌های Ink TUI، تم، هوک‌ها
└── versions/       # مخزن نسخه فایل (undo/rollback)
```

### متغیرهای محیطی

| متغیر | هدف |
|--------|------|
| `ANIQUE_HOME` | جایگزین کردن مسیر دادهٔ `~/.anique` |
| `ANIQUE_SOURCE` | جایگزین کردن ریشهٔ منبع Anique (برای evolve) |

---

## 🌐 ارائه‌دهندگان

| ارائه‌دهنده | Base URL | مدل پیش‌فرض | نیاز به کلید API |
|------------|----------|--------------|------------------|
| **OpenRouter** | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4` | بله |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4.1` | بله |
| **Anthropic** | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` | بله |
| **Ollama** | `http://127.0.0.1:11434/v1` | `llama3.2` | خیر (محلی) |
| **Custom** | `baseUrl` شما | انتخاب شما | اختیاری |

کانفیگ از طریق `anique models` یا `anique config set provider <name>`.

---

## 📚 قالب‌ها

قالب‌ها در `~/.anique/templates/` (کاربر) و `templates/` (پیش‌فرض پروژه) قرار دارند.

| قالب | لنز | هدف |
|------|------|------|
| `article.md` | write | ساختار روزنامه‌نگاری: lead، nut graf، بخش‌ها، pull-quotes، TL;DR |
| `campaign.md` | market | کمپین رشد: فرضیه، متغیرهای کپی، تقویم، متریک‌ها |
| `lesson.md` | teach | برگهٔ درس: شهود، ایدهٔ دقیق، مثال حل‌شده، تمرین، آزمونک |
| `bot-incident.md` | bot | گزارش حادثه: علائم، علت ریشه‌ای، رفع، چک‌لیست تأیید |

استفاده از ابزارهای `list_templates` / `read_template` یا `/compose` برای ویرایش.

---

## 🧠 سیستم یادگیری

Anique از مأموریت‌ها از طریق **کارت‌های یادگیری مبتنی بر شواهد (LearnCard)** یاد می‌گیرد:

1. بعد از مأموریت با ≥۴ فراخوانی ابزار، `/learn` یک مهارت پیشنهاد می‌دهد
2. بسته شواهد: نرخ موفقیت ابزار، نتیجه تأیید، خلاصه جلسه
3. اگر شواهد قوی باشد → مهارت در `~/.anique/skills/<lens>/` ذخیره می‌شود
4. جلسه بعد: `skill_load` رویکرد را قابل استفاده مجدد می‌کند

```bash
/learn              # پیشنهاد از آخرین مأموریت
/learn on           # پیشنهاد خودکار بعد از هر مأموریت
/learn off          # غیرفعال کردن یادگیری خودکار
```

---

## 🎨 ویژگی‌های TUI

- **اسپلش Aurora**: لوگوی یونیکد بزرگ هنگام بوت (گرادیان سایان → بنفش → صورتی)، سپس ورود به جلسه
- **چیدمان شبیه Cursor**: هدر گرادیانی، نوار مأموریت، فید، نوار وضعیت، پرامپت گرد
- **حباب پیام**: باکس بسته برای شما (`╭╮`) و Anique (`╔╗`)، آیکون مخصوص هر ابزار
- **اسکرول**: `↑/↓` خط (پرامپت خالی)، `PgUp/PgDn` صفحه، `Shift|Alt|Ctrl+↑/↓` سریع، `Home`/`End`
- **نوار زمینهٔ زنده**: متر بریل با رنگ آستانه (سبز → کهربایی → قرمز)
- **تئاتر مأموریت**: خط‌زمان فراخوانی ابزارها، تأییدات، استدلال
- **تم**: پالت true-color Aurora در `src/tui/theme.ts`

---

## 🤖 با کمک هوش مصنوعی

Anique را **انسان نوشته**؛ هوش مصنوعی فقط در کدنویسی، طراحی و مستندات کمک کرده — نویسندهٔ اصلی نبوده. کد را خودتان بررسی کنید؛ مثل هر پروژهٔ متن‌باز دیگر با آن برخورد کنید.

---

## 📄 مجوز

[MIT](LICENSE) — رایگان برای استفادهٔ شخصی و تجاری.

---

## 🤝 مشارکت

PRها خوش‌آمدند! لطفاً:

1. قبل از push، `npm run typecheck` و `npm run smoke` را اجرا کنید
2. سبک کد موجود را دنبال کنید (ماژول‌های کوچک، تایپ‌های صریح)
3. مارک‌داون لنز مربوطه را اگر رفتار تغییر کرد به‌روزرسانی کنید
4. برای ابزار/دستور جدید تست اضافه کنید

---

<div align="center">

**ساخته‌شده با ❤️ برای ساکنان ترمینال که یک عامل تیز و قابل‌حمل می‌خواهند.**

</div>