import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  projectMemoryForPrompt,
  readProjectMap,
} from "../learn/projectMemory.js";
import { detectVerifyCommand } from "./postEditVerify.js";

function safeGit(workspace: string, args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: workspace,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function readScripts(workspace: string): string {
  const pkgPath = join(workspace, "package.json");
  if (!existsSync(pkgPath)) {
    const cmd = detectVerifyCommand(workspace);
    return cmd ? `verify: ${cmd}` : "";
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};
    const keys = ["typecheck", "test", "build", "lint", "check", "dev"].filter(
      (k) => scripts[k],
    );
    if (!keys.length) return "";
    return keys.map((k) => `${k}: npm run ${k}`).join(" · ");
  } catch {
    return "";
  }
}

function readRulesSnippet(workspace: string, max = 2500): string {
  const candidates = [
    "ANIQUE.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".cursor/rules",
    "PRISM.md",
  ];
  const chunks: string[] = [];
  let used = 0;
  for (const rel of candidates) {
    const p = join(workspace, rel);
    if (!existsSync(p)) continue;
    try {
      const st = readFileSync(p, "utf8");
      // If directory-like read fails as file — skip
      const slice = st.slice(0, Math.min(1200, max - used));
      chunks.push(`### ${rel}\n${slice}`);
      used += slice.length;
      if (used >= max) break;
    } catch {
      continue;
    }
  }
  return chunks.join("\n\n");
}

function mapStale(workspace: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): boolean {
  const map = readProjectMap(workspace);
  if (!map) return true;
  if (!map.files?.length) return true;
  const t = Date.parse(map.updatedAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > maxAgeMs;
}

export function isProjectMapStale(workspace: string): boolean {
  return mapStale(workspace);
}

/**
 * Compact pre-turn context for coding / private lenses.
 * Keep short — injected into system prompt once per mission.
 */
export function buildContextPack(
  workspace: string,
  opts?: { includeProjectMemory?: boolean; maxChars?: number },
): string {
  const maxChars = opts?.maxChars ?? 4500;
  const parts: string[] = [];

  const branch = safeGit(workspace, "rev-parse --abbrev-ref HEAD");
  const status = safeGit(workspace, "status --short").split("\n").filter(Boolean).slice(0, 20);
  const log = safeGit(workspace, "log -5 --oneline");
  if (branch || status.length || log) {
    const gitLines = [
      branch ? `branch: ${branch}` : "",
      status.length ? `dirty (${status.length}):\n${status.join("\n")}` : "clean working tree",
      log ? `recent:\n${log}` : "",
    ].filter(Boolean);
    parts.push(`## Git\n${gitLines.join("\n")}`);
  }

  const scripts = readScripts(workspace);
  if (scripts) parts.push(`## Scripts\n${scripts}`);

  const rules = readRulesSnippet(workspace);
  if (rules) parts.push(`## Project rules\n${rules}`);

  if (opts?.includeProjectMemory !== false) {
    const map = readProjectMap(workspace);
    const mem = projectMemoryForPrompt(workspace, 2000);
    if (map?.summary) {
      parts.push(
        `## Project map\nupdated: ${map.updatedAt} · files: ${map.files.length}\n${map.summary.slice(0, 800)}`,
      );
    } else {
      parts.push(
        "## Project map\n(empty or stale — call project_ingest before deep exploration)",
      );
    }
    if (mem.trim()) {
      parts.push(`## Project memory\n${mem}`);
    }
  }

  let out = parts.join("\n\n");
  if (out.length > maxChars) out = out.slice(0, maxChars) + "\n…[context pack truncated]";
  return out;
}
