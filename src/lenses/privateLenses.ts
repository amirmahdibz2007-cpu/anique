import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";
import type { LensDefinition } from "./index.js";

const ATELIER_ID = "atelier";

const ATELIER_MD = `---
title: Atelier
description: Private deep-coding lens · reads this repo carefully and remembers it
private: true
tools: code
---

# Atelier (private coding lens)

You are **Anique / atelier** — the owner's private coding workshop.
This lens is **not public**. It exists only for deep, careful work on the current project.

## Mission
1. **Know the repo** — before changing anything non-trivial, map and read the real tree (glob/grep/read). Do not invent files.
2. **Learn durably** — after understanding architecture, conventions, entry points, and pitfalls, persist notes with \`memory_write\` (append) and keep skills via LearnCard / skill notes. Prefer lasting project memory over one-off chatter.
3. **Care first** — smallest correct change. Prior versions are auto-saved on writes; still prefer surgical \`apply_patch\`.
4. **Remember** — use \`recall\` and project memory. When the user returns later, build on what was already learned about THIS workspace.
5. **Ingest** — if project memory looks empty or stale, run a deliberate ingest pass: structure → key modules → conventions → risks, then write dated MEMORY entries titled with the project name.

## Behavior
- Explore before edit. Cite real paths.
- In **plan** rhythm: investigate only; produce a concrete plan.
- In **act** rhythm: implement, verify (tests when sensible), summarize what changed and what you learned.
- Match existing style from ANIQUE.md / repo conventions.
- When the user speaks Persian, reply in Persian; keep code/paths Latin.

## Quality bar
Precision over speed. Never claim you read a file you did not. Never claim the whole repo is memorized if you only skimmed — say what you ingested and what remains.
`;

export function privateLensesDir(): string {
  ensureAniqueHome();
  const dir = join(aniqueHome(), "private", "lenses");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureAtelierLens(): string {
  const dir = privateLensesDir();
  const path = join(dir, `${ATELIER_ID}.md`);
  if (!existsSync(path)) {
    writeFileSync(path, ATELIER_MD, "utf8");
  }
  // skills bucket for this lens
  mkdirSync(join(aniqueHome(), "skills", ATELIER_ID), { recursive: true });
  mkdirSync(join(aniqueHome(), "private", "projects"), { recursive: true });
  return path;
}

interface PrivateMeta {
  id: string;
  title: string;
  description: string;
  toolsPreset: "code" | "common";
  body: string;
}

function parsePrivateLensFile(id: string, raw: string): PrivateMeta {
  let title = id;
  let description = "Private lens";
  let toolsPreset: "code" | "common" = "code";
  let body = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("---", 3);
    if (end > 0) {
      const fm = raw.slice(3, end);
      body = raw.slice(end + 3).trim();
      for (const line of fm.split("\n")) {
        const m = line.match(/^(\w+):\s*(.+)$/);
        if (!m) continue;
        const k = m[1]!;
        const v = m[2]!.trim();
        if (k === "title") title = v;
        if (k === "description") description = v;
        if (k === "tools" && v === "common") toolsPreset = "common";
      }
    }
  }

  return { id, title, description, toolsPreset, body };
}

export function listPrivateLensIds(): string[] {
  ensureAtelierLens();
  const dir = privateLensesDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("README"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

export function isPrivateLensId(id: string): boolean {
  return listPrivateLensIds().includes(id);
}

export function loadPrivateLens(
  id: string,
  toolsFor: (preset: "code" | "common") => string[],
): LensDefinition | null {
  ensureAtelierLens();
  const path = join(privateLensesDir(), `${id}.md`);
  if (!existsSync(path)) return null;
  const meta = parsePrivateLensFile(id, readFileSync(path, "utf8"));
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    tools: toolsFor(meta.toolsPreset),
    systemPrompt: meta.body,
    private: true,
  };
}

export const ATELIER_LENS_ID = ATELIER_ID;
