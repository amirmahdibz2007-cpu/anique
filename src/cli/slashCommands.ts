/**
 * Shared slash-command core used by TUI and classic REPL.
 * UI-specific flows (models wizard, session picker) stay in the hosts;
 * portable business logic lives here so behavior doesn't drift.
 */
import { loadConfig, saveConfig, type BootMode } from "../config/index.js";
import { getLens, listLensIds } from "../lenses/index.js";
import { ensureAtelierLens } from "../lenses/privateLenses.js";
import {
  ensureInbox,
  openInboxExternal,
  readInboxMessage,
  clearInbox,
  archiveInbox,
  inboxPath,
} from "../compose/inbox.js";
import { readMemoryFile } from "../memory/files.js";
import { resolveRuntimeConfig } from "../config/runtime.js";
import {
  findProjectForPath,
  listNamedProjects,
  createNamedProject,
  bindPathToProject,
  renameNamedProject,
  unbindPath,
} from "../learn/namedProjects.js";
import { readProjectMemory, projectStoreDir } from "../learn/projectMemory.js";
import { splitThinkAnswer } from "../agent/answerSanitize.js";
import { copyToClipboard } from "../util/clipboard.js";

export type SlashHost = "tui" | "classic";

export interface SlashContext {
  host: SlashHost;
  lens: string;
  workspace: string;
  rhythm: "plan" | "act";
  lastUserPrompt?: string;
  historyUserPrompt?: string;
  /** Latest assistant reply (for /copy, /skill save, …). */
  lastAssistant?: string;
}

export type SlashOutcome =
  | { kind: "ok"; lines: string[]; patch?: Partial<{ lens: string; rhythm: "plan" | "act"; locale: "en" | "fa"; boot: BootMode }> }
  | { kind: "mission"; prompt: string; deepMode?: "force" | "off"; redo?: boolean; archiveInbox?: boolean }
  | { kind: "quit" }
  | { kind: "unhandled" };

/** Commands that both hosts must implement identically (parity list). */
export const SHARED_SLASH_COMMANDS = [
  "fa",
  "en",
  "compose",
  "inbox",
  "send",
  "plan",
  "act",
  "lens",
  "redo",
  "retry",
  "redo!",
  "memory",
  "boot",
  "atelier",
  "project",
  "copy",
] as const;

/** Prefer visible answer (strip think blocks); fall back to raw. */
export function replyTextForCopy(raw: string): string {
  const { answer } = splitThinkAnswer(raw || "");
  return (answer || raw || "").trim();
}

export function parseSlash(raw: string): { cmd: string; rest: string[] } {
  const [cmd = "", ...rest] = raw.replace(/^\//, "").trim().split(/\s+/);
  return { cmd: cmd.toLowerCase(), rest };
}

export async function dispatchSharedSlash(
  raw: string,
  ctx: SlashContext,
): Promise<SlashOutcome> {
  const { cmd, rest } = parseSlash(raw.startsWith("/") ? raw : `/${raw}`);
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "fa":
    case "فارسی": {
      saveConfig({ locale: "fa" });
      return {
        kind: "ok",
        lines: [
          "fa-reply on · UI stays English.",
          "Type here normally, or /compose then /send for GUI Persian typing.",
        ],
        patch: { locale: "fa" },
      };
    }
    case "en":
    case "english": {
      saveConfig({ locale: "en" });
      return {
        kind: "ok",
        lines: ["Replies: English · UI unchanged"],
        patch: { locale: "en" },
      };
    }
    case "compose":
    case "inbox": {
      if (arg === "watch" || arg === "auto") {
        ensureInbox();
        const opened = openInboxExternal();
        return {
          kind: "ok",
          lines: [
            "Compose watch requested — host should enable auto-/send on save.",
            `File: ${opened.path}`,
          ],
        };
      }
      if (arg === "nowatch" || arg === "stop") {
        return { kind: "ok", lines: ["Compose watch OFF"] };
      }
      ensureInbox();
      const opened = openInboxExternal();
      return {
        kind: "ok",
        lines: [
          "Compose outside the terminal.",
          `File: ${opened.path}`,
          `Opened with: ${opened.how}`,
          "Save, then /send · Tip: /compose watch",
        ],
      };
    }
    case "send": {
      const body = readInboxMessage();
      if (!body.trim()) {
        return {
          kind: "ok",
          lines: [
            `Inbox empty. Edit ${inboxPath()} then /send (or /compose).`,
          ],
        };
      }
      archiveInbox(body);
      clearInbox();
      return { kind: "mission", prompt: body, archiveInbox: true };
    }
    case "plan":
      return {
        kind: "ok",
        lines: ["rhythm → plan"],
        patch: { rhythm: "plan" },
      };
    case "act":
      return {
        kind: "ok",
        lines: ["rhythm → act"],
        patch: { rhythm: "act" },
      };
    case "lens": {
      if (!arg) {
        return {
          kind: "ok",
          lines: [`lenses: ${listLensIds().join(", ")}`, `current: ${ctx.lens}`],
        };
      }
      try {
        getLens(arg);
        return {
          kind: "ok",
          lines: [`lens → ${arg}`],
          patch: { lens: arg },
        };
      } catch (err) {
        return {
          kind: "ok",
          lines: [err instanceof Error ? err.message : String(err)],
        };
      }
    }
    case "atelier": {
      ensureAtelierLens();
      return {
        kind: "ok",
        lines: ["atelier lens ready"],
        patch: { lens: "atelier" },
      };
    }
    case "memory": {
      const kind = (arg || "user") as "user" | "memory";
      const body = readMemoryFile(kind === "memory" ? "memory" : "user");
      return {
        kind: "ok",
        lines: [`## ${kind}\n${body.slice(0, 4000) || "(empty)"}`],
      };
    }
    case "boot": {
      const v = arg as BootMode;
      if (v === "resume-last" || v === "picker" || v === "new") {
        saveConfig({ boot: v });
        return {
          kind: "ok",
          lines: [`boot → ${v}`],
          patch: { boot: v },
        };
      }
      const cfg = loadConfig();
      return {
        kind: "ok",
        lines: [
          `boot=${cfg.boot ?? "resume-last"} (resume-last|picker|new)`,
          "Usage: /boot resume-last | picker | new",
        ],
      };
    }
    case "redo":
    case "redo!":
    case "retry": {
      const prompt =
        ctx.lastUserPrompt ||
        ctx.historyUserPrompt ||
        "";
      if (!prompt.trim()) {
        return { kind: "ok", lines: ["Nothing to redo yet."] };
      }
      const force = cmd === "redo!" || cmd === "retry" || rest[0] === "!" || rest[0] === "go";
      if (!force) {
        const preview =
          prompt.length > 400 ? `${prompt.slice(0, 400)}…` : prompt;
        return {
          kind: "ok",
          lines: [
            "redo preview — edit then resend, or /redo! unchanged.",
            "───",
            preview,
            `__REDO_EDIT__:${prompt}`,
          ],
        };
      }
      return { kind: "mission", prompt, redo: true };
    }
    case "project":
    case "projects": {
      const sub = (rest[0] || "").toLowerCase();
      const subArg = rest.slice(1).join(" ").trim();

      if (!sub || sub === "status") {
        const proj = findProjectForPath(ctx.workspace);
        if (!proj) {
          return {
            kind: "ok",
            lines: [
              `No named project bound to ${ctx.workspace}.`,
              "Usage: /project new <name> · /project bind <name> · /project list",
            ],
          };
        }
        const mem = readProjectMemory(ctx.workspace);
        return {
          kind: "ok",
          lines: [
            `Project: "${proj.name}" (${proj.id})`,
            `Bound directories:\n${proj.paths.map((p) => `  - ${p}`).join("\n")}`,
            `Durable memory: ${mem.trim() ? `${mem.trim().length} chars` : "(empty)"}`,
            "Global USER.md/MEMORY.md still apply on top of this.",
          ],
        };
      }

      if (sub === "list") {
        const all = listNamedProjects();
        if (!all.length) {
          return { kind: "ok", lines: ["No named projects yet. Try: /project new <name>"] };
        }
        return {
          kind: "ok",
          lines: all.map(
            (p) => `${p.id.padEnd(16)} "${p.name}" — ${p.paths.length} dir(s): ${p.paths.join(", ")}`,
          ),
        };
      }

      if (sub === "new") {
        if (!subArg) return { kind: "ok", lines: ["Usage: /project new <name>"] };
        try {
          const oldDir = projectStoreDir(ctx.workspace);
          const proj = createNamedProject(subArg, ctx.workspace, {
            migrateFromHashDir: oldDir,
          });
          return {
            kind: "ok",
            lines: [
              `Created project "${proj.name}" (${proj.id}) bound to ${ctx.workspace}.`,
              "Existing project memory here (if any) was carried over.",
              "It keeps its own memory + chat history, plus your default USER.md/MEMORY.md.",
            ],
          };
        } catch (err) {
          return { kind: "ok", lines: [err instanceof Error ? err.message : String(err)] };
        }
      }

      if (sub === "bind") {
        if (!subArg) return { kind: "ok", lines: ["Usage: /project bind <name>"] };
        try {
          const proj = bindPathToProject(subArg, ctx.workspace);
          return {
            kind: "ok",
            lines: [`Bound ${ctx.workspace} → project "${proj.name}" (${proj.id}).`],
          };
        } catch (err) {
          return { kind: "ok", lines: [err instanceof Error ? err.message : String(err)] };
        }
      }

      if (sub === "rename") {
        const proj = findProjectForPath(ctx.workspace);
        if (!proj) return { kind: "ok", lines: ["No project bound here to rename."] };
        if (!subArg) return { kind: "ok", lines: ["Usage: /project rename <new name>"] };
        const updated = renameNamedProject(proj.id, subArg);
        return { kind: "ok", lines: [`Renamed to "${updated.name}".`] };
      }

      if (sub === "unbind") {
        const removed = unbindPath(ctx.workspace);
        return {
          kind: "ok",
          lines: [
            removed
              ? `Unbound this directory from "${removed.name}".`
              : "This directory wasn't bound to a project.",
          ],
        };
      }

      return {
        kind: "ok",
        lines: [
          "Usage: /project [status] · new <name> · bind <name> · rename <name> · unbind · list",
        ],
      };
    }
    case "config": {
      const rt = resolveRuntimeConfig();
      return {
        kind: "ok",
        lines: [
          JSON.stringify(
            {
              provider: rt.provider,
              model: rt.model,
              baseUrl: rt.baseUrl,
              boot: rt.boot,
              locale: rt.locale,
              approvalMode: rt.approvalMode,
              source: rt.source,
            },
            null,
            2,
          ),
        ],
      };
    }
    case "copy": {
      const text = replyTextForCopy(ctx.lastAssistant || "");
      if (!text) {
        return { kind: "ok", lines: ["No assistant reply to copy yet."] };
      }
      const result = copyToClipboard(text);
      if (result.ok) {
        return {
          kind: "ok",
          lines: [`Copied last reply (${text.length} chars) via ${result.method}`],
        };
      }
      return {
        kind: "ok",
        lines: [`Clipboard failed: ${result.error}`],
      };
    }
    default:
      return { kind: "unhandled" };
  }
}
