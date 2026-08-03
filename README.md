<div align="center">

# ◆ Anique

**A multi-domain AI agent in your terminal** — a Cursor-like TUI, a portable CLI, and your own API keys. One core agent. Many lenses.

<br/>

`TypeScript` · `Node 22+` · `Ink TUI`

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/amirmahdibz2007-cpu/anique/pulls)

</div>

---

**Anique** runs a sharp agent loop in the terminal. Swap **lenses** to change what it's good at — writing, coding, teaching, marketing, bots, systems — or pick the **evolve** lens to make Anique improve itself.

```
◆ ANIQUE  code · act · openrouter/anthropic/claude-sonnet-4
┌─────────────────────────────────────────────┐
│  ▸ you   fix the flaky auth test            │
│  ⚙ grep   ⚙ apply_patch   ◆ anique …       │
│  ▸ you   why is CI red?                     │
│  ⚙ bash npm test   ◆ 3 tests fixed          │
└─────────────────────────────────────────────┘
› ask Anique…   ↑/↓ scroll · PgUp/PgDn
```

## ✨ Highlights

- **Agent loop with tools** — file read/write, patch, grep/glob, bash, git, memory, skills, todos — plus a plan-before-act rhythm.
- **Lenses** — swap domain expertise with one keypress (`/code`, `/write`, `/teach`, …).
- **Deep missions** — auto-plan → execute → verify → repair → synthesize for hard tasks.
- **Cheap by design** — automatic long-history compaction so tokens stay low and sessions never overflow.
- **Safety gates** — risk-classified approvals (`safe` / `workspace_write` / `dangerous`), session-wide allow, allowlists, undo + version vault.
- **Multi-provider** — OpenRouter, OpenAI, Ollama, or any OpenAI-compatible endpoint.

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

## 🧭 Lenses

| Lens      | Use it for                                        | Commands        |
|-----------|---------------------------------------------------|-----------------|
| `code`    | Repos, edits, tests, git                          | `/code`         |
| `write`   | Essays, docs, journalism, scripts                 | `/write`        |
| `teach`   | Lessons, drills, quizzes                          | `/teach`        |
| `market`  | Growth, copy, funnels, calendars                  | `/market`       |
| `bot`     | Chatbot / Telegram / agent debugging              | `/bot`          |
| `system`  | Dotfiles & services (high-friction approvals)     | `/system`       |
| `evolve`  | Improve Anique's own code & prompts               | `/evolve`       |
| `daily`   | Daily planning & review                           | `/daily`        |

My personal taste lives in **`~/.anique/USER.md`** — edit it or run `anique setup`.

## ⚡ Quick usage

```bash
anique                              # TUI (default)
anique tui -l write                 # TUI in write lens
anique ask -l code "why is CI red?" # one-shot
anique mission -l bot "…"           # live theater timeline
anique resume                       # resume last session in TUI
anique export                       # export session to markdown
anique evolve --plan "…"            # self-improvement pass
anique lenses-reset                 # restore shipped lenses
```

### Providers

```bash
anique config set provider openrouter
anique config set provider openai
anique config set provider ollama
anique config set model llama3.2
```

## 🛡 Safety

- Dangerous shell commands and out-of-workspace writes always require confirmation.
- Risk classes: `safe` → `workspace_write` → `dangerous`; allow them **once**, per-**session**, per-**workspace**, or **always**.
- Every prior file version is saved before an edit — undo with `/undo`.
- API keys live in `~/.anique/config.json` (mode `600`), never in the repo.

## 🧑💻 Development

```bash
npm run typecheck   # TypeScript type-check
npm run smoke       # offline sanity checks (9 lenses, safety, prompts)
npm run e2e         # end-to-end approval behavior tests
npm run build       # compile to dist/
npm run anique -- … # run from source
```

Env: `ANIQUE_HOME`, `ANIQUE_SOURCE`.

## 📄 License

[MIT](LICENSE)
