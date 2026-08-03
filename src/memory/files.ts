import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ensureAniqueHome, aniqueHome } from "../config/index.js";

export type MemoryKind = "user" | "memory";

function pathFor(kind: MemoryKind): string {
  ensureAniqueHome();
  return join(aniqueHome(), kind === "user" ? "USER.md" : "MEMORY.md");
}

export function readMemoryFile(kind: MemoryKind): string {
  const p = pathFor(kind);
  if (!existsSync(p)) {
    const starter =
      kind === "user"
        ? `# USER

- Languages: (set your preferred languages)
- Tone: direct, concrete
- Focus: code / writing / teaching / bots / mixed

## Preferences
- Match my language when I write in it.
- Ask before destructive system changes.

Edit anytime: anique memory user
# or during setup: anique setup
`
        : `# MEMORY

Short durable notes across sessions.

## Active projects

-
`;
    writeFileSync(p, starter, "utf8");
    return starter;
  }
  return readFileSync(p, "utf8");
}

export function writeMemoryFile(kind: MemoryKind, content: string): void {
  const p = pathFor(kind);
  mkdirSync(aniqueHome(), { recursive: true });
  writeFileSync(p, content, "utf8");
}
