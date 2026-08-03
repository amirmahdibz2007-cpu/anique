import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, basename } from "node:path";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";

export interface ProjectMap {
  workspace: string;
  updatedAt: string;
  files: Array<{ path: string; bytes: number }>;
  summary: string;
}

function projectKey(workspace: string): string {
  return createHash("sha1").update(workspace).digest("hex").slice(0, 12);
}

export function projectStoreDir(workspace: string): string {
  ensureAniqueHome();
  const dir = join(aniqueHome(), "private", "projects", projectKey(workspace));
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function projectMemoryPath(workspace: string): string {
  return join(projectStoreDir(workspace), "PROJECT.md");
}

export function projectMapPath(workspace: string): string {
  return join(projectStoreDir(workspace), "map.json");
}

export function readProjectMemory(workspace: string): string {
  const p = projectMemoryPath(workspace);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

export function appendProjectMemory(
  workspace: string,
  title: string,
  body: string,
): void {
  const p = projectMemoryPath(workspace);
  const date = new Date().toISOString().slice(0, 10);
  const block = `\n## [${date}] ${title.slice(0, 120)}\n${body.slice(0, 8000)}\n`;
  if (!existsSync(p)) {
    writeFileSync(
      p,
      `# Project memory — ${basename(workspace)}\n\nDurable notes for atelier lens. Newer entries below.\n${block}`,
      "utf8",
    );
    return;
  }
  writeFileSync(p, readFileSync(p, "utf8").trimEnd() + "\n" + block, "utf8");
}

export function saveProjectMap(workspace: string, map: ProjectMap): void {
  writeFileSync(projectMapPath(workspace), JSON.stringify(map, null, 2) + "\n");
}

export function readProjectMap(workspace: string): ProjectMap | null {
  const p = projectMapPath(workspace);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ProjectMap;
  } catch {
    return null;
  }
}

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".cache",
  "target",
  "vendor",
]);

const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|c|cc|cpp|h|hpp|cs|rb|php|vue|svelte|md|json|yml|yaml|toml|css|scss)$/i;

/** Walk workspace and build a compact file map (capped). */
export function scanProjectTree(
  workspace: string,
  opts?: { maxFiles?: number },
): ProjectMap {
  const maxFiles = opts?.maxFiles ?? 400;
  const files: Array<{ path: string; bytes: number }> = [];

  const walk = (dir: string, depth: number) => {
    if (files.length >= maxFiles || depth > 8) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (files.length >= maxFiles) break;
      if (name.startsWith(".") && name !== ".env.example") continue;
      if (IGNORE.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!st.isFile()) continue;
      if (!CODE_EXT.test(name) && !/^(README|ANIQUE|PRISM|package|Cargo|go\.mod|pyproject)/i.test(name)) {
        continue;
      }
      if (st.size > 400_000) continue;
      files.push({
        path: relative(workspace, full).replace(/\\/g, "/") || name,
        bytes: st.size,
      });
    }
  };

  walk(workspace, 0);
  files.sort((a, b) => a.path.localeCompare(b.path));

  const top = files.slice(0, 80).map((f) => `- ${f.path} (${f.bytes}b)`);
  const summary = [
    `Workspace: ${workspace}`,
    `Tracked code-ish files: ${files.length}${files.length >= maxFiles ? "+" : ""}`,
    "Sample paths:",
    ...top,
  ].join("\n");

  return {
    workspace,
    updatedAt: new Date().toISOString(),
    files,
    summary,
  };
}

/** Text for prompt injection — map summary + recent project memory. */
export function projectMemoryForPrompt(workspace: string, maxChars = 6000): string {
  const map = readProjectMap(workspace);
  const mem = readProjectMemory(workspace);
  const parts: string[] = [];
  if (map) {
    parts.push(
      `### Map (updated ${map.updatedAt})\n${map.files.length} files indexed. Sample:\n${map.files
        .slice(0, 60)
        .map((f) => `- ${f.path}`)
        .join("\n")}`,
    );
  } else {
    parts.push(
      "### Map\n(empty — run project_ingest or /ingest to learn this repo)",
    );
  }
  if (mem.trim()) {
    parts.push(`### Durable notes\n${mem.slice(-Math.floor(maxChars * 0.65))}`);
  }
  return parts.join("\n\n").slice(0, maxChars);
}

export function listKnownProjects(): Array<{ key: string; path: string }> {
  const root = join(aniqueHome(), "private", "projects");
  if (!existsSync(root)) return [];
  const out: Array<{ key: string; path: string }> = [];
  for (const key of readdirSync(root)) {
    const mapPath = join(root, key, "map.json");
    if (!existsSync(mapPath)) continue;
    try {
      const m = JSON.parse(readFileSync(mapPath, "utf8")) as ProjectMap;
      out.push({ key, path: m.workspace });
    } catch {
      out.push({ key, path: "?" });
    }
  }
  return out;
}
