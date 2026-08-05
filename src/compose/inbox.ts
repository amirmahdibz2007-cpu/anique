import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  watch,
} from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";

const TEMPLATE = `# Anique inbox
# Write your message below this line (Persian/English — any GUI editor).
# Then in the TUI type: /send
# ────────────────────────────────────────

`;

export function inboxPath(): string {
  ensureAniqueHome();
  return join(aniqueHome(), "inbox.md");
}

export function ensureInbox(): string {
  const path = inboxPath();
  if (!existsSync(path)) {
    writeFileSync(path, TEMPLATE, "utf8");
  }
  return path;
}

/** Body after the separator / first non-comment block. */
export function readInboxMessage(): string {
  const path = ensureInbox();
  const raw = readFileSync(path, "utf8");
  const sep = raw.indexOf("────");
  let body = sep >= 0 ? raw.slice(raw.indexOf("\n", sep) + 1) : raw;
  body = body
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();
  return body;
}

export function clearInbox(): void {
  writeFileSync(ensureInbox(), TEMPLATE, "utf8");
}

/** Archive last sent body (keeps one prior). */
export function archiveInbox(body: string): void {
  const dir = join(aniqueHome(), "inbox-sent");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(dir, `${stamp}.md`), body + "\n", "utf8");
  try {
    copyFileSync(inboxPath(), join(dir, "latest.md"));
  } catch {
    /* ignore */
  }
}

/**
 * Best-effort open in a GUI / $EDITOR so Persian renders correctly.
 * Does not block the TUI.
 */
export function openInboxExternal(): { path: string; how: string } {
  const path = ensureInbox();
  const gui =
    process.env.ANIQUE_INBOX_OPEN?.trim() ||
    process.env.VISUAL?.trim() ||
    process.env.EDITOR?.trim() ||
    "";

  if (gui) {
    try {
      spawn(gui, [path], {
        detached: true,
        stdio: "ignore",
        shell: true,
      }).unref();
      return { path, how: gui };
    } catch {
      /* fall through */
    }
  }

  // Try common GUI openers (non-blocking)
  for (const cmd of ["xdg-open", "cursor", "code", "kate", "gedit"]) {
    try {
      const child = spawn(cmd, [path], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", () => {});
      child.unref();
      return { path, how: cmd };
    } catch {
      /* try next */
    }
  }

  return { path, how: "open manually" };
}

/** True when inbox has a non-empty draft ready to /send. */
export function inboxHasDraft(): boolean {
  return Boolean(readInboxMessage().trim());
}

/**
 * Watch inbox.md for saves. When body becomes non-empty after a change,
 * invoke onReady (typically auto-/send). Returns disposer.
 */
export function watchInbox(
  onReady: (body: string) => void,
): () => void {
  const path = ensureInbox();
  let lastBody = readInboxMessage();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = () => {
    try {
      const body = readInboxMessage();
      if (body.trim() && body !== lastBody) {
        lastBody = body;
        onReady(body);
      } else {
        lastBody = body;
      }
    } catch {
      /* ignore */
    }
  };

  let watcher: { close: () => void } | null = null;
  try {
    watcher = watch(path, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, 400);
    });
  } catch {
    // Polling fallback
    const id = setInterval(check, 1500);
    return () => clearInterval(id);
  }

  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
