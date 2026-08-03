import { createInterface } from "node:readline";
import type { ApprovalMode, AniqueConfig } from "../config/index.js";
import { saveConfig } from "../config/index.js";

const DANGEROUS_BASH =
  /\b(rm\s+|sudo\b|chmod\b|chown\b|mkfs\b|dd\b|shutdown\b|reboot\b|systemctl\b|userdel\b|passwd\b|>\s*\/|curl\s+[^\n]*\|\s*(ba)?sh)/i;

export type RiskLevel = "safe" | "workspace_write" | "dangerous";
export type ApprovalDecision = "once" | "session" | "workspace" | "always" | "unlock" | "deny";

export function classifyBash(command: string): RiskLevel {
  if (DANGEROUS_BASH.test(command)) return "dangerous";
  return "safe";
}

export function classifyWrite(targetPath: string, workspace: string): RiskLevel {
  const resolved = targetPath;
  const ws = workspace.replace(/\/$/, "");
  if (resolved === ws || resolved.startsWith(ws + "/")) {
    return "workspace_write";
  }
  return "dangerous";
}

function onAllowlist(command: string, allowlist: string[]): boolean {
  const c = command.trim();
  return allowlist.some((prefix) => c.startsWith(prefix) || c === prefix.trim());
}

/**
 * suggest  — approve workspace writes + dangerous (safest default)
 * allowlist — auto-approve safe bash on allowlist + workspace writes; ask for dangerous
 * auto — only ask for dangerous
 */
export function needsApproval(
  risk: RiskLevel,
  mode: ApprovalMode,
  rhythm: "plan" | "act",
  opts?: { command?: string; allowlist?: string[] },
): boolean {
  if (rhythm === "plan") return risk !== "safe";
  if (risk === "dangerous") return true;
  if (mode === "auto") return false;
  if (mode === "allowlist") {
    if (risk === "safe" && opts?.command) {
      return !onAllowlist(opts.command, opts.allowlist ?? []);
    }
    if (risk === "workspace_write") return false;
    return true;
  }
  return risk !== "safe";
}

/** Session-scoped allows (cleared on process exit / new session). */
const sessionAllows = new Map<string, true>();

export function sessionAllowKey(kind: string, detail: string): string {
  return `${kind}::${detail.slice(0, 200)}`;
}

export function clearSessionAllows(): void {
  sessionAllows.clear();
}

export function hasSessionAllow(key: string): boolean {
  return sessionAllows.has(key);
}

export function grantSessionAllow(key: string): void {
  sessionAllows.set(key, true);
}

export function sessionAllowCount(): number {
  return sessionAllows.size;
}

/** Session-wide allow for every workspace_write (files inside the workspace). */
const WORKSPACE_ALLOW_KEY = "workspace_write::*";

export function grantWorkspaceWriteAllow(): void {
  sessionAllows.set(WORKSPACE_ALLOW_KEY, true);
}

export function hasWorkspaceWriteAllow(): boolean {
  return sessionAllows.has(WORKSPACE_ALLOW_KEY);
}

export function clearWorkspaceWriteAllow(): void {
  sessionAllows.delete(WORKSPACE_ALLOW_KEY);
}

/**
 * Trusted-session unlock: when granted, every action (safe, workspace_write,
 * and dangerous) is allowed for the rest of the process/session without asking.
 */
const UNLOCK_KEY = "__anique_unlock_all__";

export function isSessionUnlocked(): boolean {
  return sessionAllows.has(UNLOCK_KEY);
}

export function unlockSession(): void {
  sessionAllows.set(UNLOCK_KEY, true);
}

export function lockSession(): void {
  sessionAllows.delete(UNLOCK_KEY);
}

export interface ApprovalRequest {
  prompt: string;
  risk?: RiskLevel;
  tool?: string;
  preview?: string;
  permissionMode?: string;
}

export type ApprovalHandler = (
  req: ApprovalRequest,
) => Promise<ApprovalDecision>;

let approvalHandler: ApprovalHandler | null = null;

/** TUI registers an Ink modal handler; classic REPL uses readline. */
export function setApprovalHandler(handler: ApprovalHandler | null): void {
  approvalHandler = handler;
}

export async function askApprovalDecision(
  promptOrReq: string | ApprovalRequest,
): Promise<ApprovalDecision> {
  const req: ApprovalRequest =
    typeof promptOrReq === "string"
      ? { prompt: promptOrReq }
      : promptOrReq;

  if (approvalHandler) return approvalHandler(req);

  if (!process.stdin.isTTY) {
    console.error(`[approval required, non-TTY — denying] ${req.prompt}`);
    return "deny";
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const lines = [
    req.prompt,
    req.risk ? `  risk=${req.risk}` : "",
    req.preview ? `  preview: ${req.preview.slice(0, 120)}` : "",
    "  [y]once [s]session [a]always [u]unlock-all [n]deny › ",
  ].filter(Boolean);
  const answer = await new Promise<string>((resolve) => {
    rl.question(lines.join("\n"), resolve);
  });
  rl.close();
  const a = answer.trim().toLowerCase();
  if (a === "s" || a === "session") return "session";
  if (a === "a" || a === "always") return "always";
  if (a === "u" || a === "unlock") return "unlock";
  if (req.risk === "workspace_write" && (a === " " || a === "" || a === "w" || a === "all")) {
    return "workspace";
  }
  if (a === "y" || a === "yes" || a === "once") return "once";
  return "deny";
}

/** Back-compat: true = once/session/always, false = deny */
export async function askApproval(prompt: string): Promise<boolean> {
  const d = await askApprovalDecision(prompt);
  return d !== "deny";
}

export function applyApprovalDecision(
  decision: ApprovalDecision,
  opts: { sessionKey: string; alwaysPrefix?: string },
): boolean {
  if (decision === "deny") return false;
  if (decision === "unlock") {
    // Fully trusted session: allow every action (incl. dangerous) for the
    // rest of the session without asking again.
    unlockSession();
    return true;
  }
  if (decision === "workspace") {
    // Allow this exact action now + every workspace_write for the session.
    grantSessionAllow(opts.sessionKey);
    grantWorkspaceWriteAllow();
    return true;
  }
  if (decision === "once" || decision === "session") {
    // once also registers a session allow for this exact action, so the
    // same command/file being repeated later in a session does not ask
    // again. session uses the same key (which is description-scoped).
    grantSessionAllow(opts.sessionKey);
    return true;
  }
  if (decision === "always" && opts.alwaysPrefix) {
    const cfg = saveConfig({});
    const list = [...(cfg.allowlistBash ?? [])];
    if (!list.includes(opts.alwaysPrefix)) {
      list.push(opts.alwaysPrefix);
      saveConfig({ allowlistBash: list });
    }
    grantSessionAllow(opts.sessionKey);
    return true;
  }
  return true; // once
}

export function approvalHint(config: AniqueConfig): string {
  return `approval=${config.approvalMode} (suggest|allowlist|auto) · y/s/a/n`;
}
