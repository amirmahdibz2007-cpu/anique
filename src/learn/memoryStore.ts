import { readMemoryFile, writeMemoryFile } from "../memory/files.js";

const ENTRY_RE = /^## \[(\d{4}-\d{2}-\d{2})\] (.+)$/gm;
const MAX_ENTRIES = 40;

export interface MemoryEntry {
  date: string;
  title: string;
  body: string;
  lens?: string;
}

/** Parse dated MEMORY.md entries. */
export function parseMemoryEntries(raw: string): MemoryEntry[] {
  const lines = raw.split("\n");
  const entries: MemoryEntry[] = [];
  let cur: MemoryEntry | null = null;
  const body: string[] = [];

  const flush = () => {
    if (!cur) return;
    cur.body = body.join("\n").trim();
    entries.push(cur);
    body.length = 0;
    cur = null;
  };

  for (const line of lines) {
    const m = line.match(/^## \[(\d{4}-\d{2}-\d{2})\] (.+)$/);
    if (m) {
      flush();
      cur = { date: m[1]!, title: m[2]!.trim(), body: "" };
      continue;
    }
    if (cur) body.push(line);
  }
  flush();
  return entries;
}

export function formatMemoryFile(
  header: string,
  entries: MemoryEntry[],
): string {
  const parts = [header.trimEnd(), ""];
  for (const e of entries) {
    parts.push(`## [${e.date}] ${e.title}`);
    if (e.lens) parts.push(`lens: ${e.lens}`);
    parts.push(e.body);
    parts.push("");
  }
  return parts.join("\n").trimEnd() + "\n";
}

function defaultHeader(): string {
  return `# MEMORY

Short durable notes across sessions. Newer entries first.
`;
}

/** Append a dated entry and prune to MAX_ENTRIES (newest kept). */
export function appendMemoryEntry(opts: {
  title: string;
  body: string;
  lens?: string;
}): string {
  const raw = readMemoryFile("memory");
  const entries = parseMemoryEntries(raw);
  const headerMatch = raw.split(/^## \[\d{4}-\d{2}-\d{2}\]/m)[0] || defaultHeader();
  const date = new Date().toISOString().slice(0, 10);
  const next: MemoryEntry[] = [
    {
      date,
      title: opts.title.slice(0, 120),
      body: opts.body.slice(0, 2000),
      lens: opts.lens,
    },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  const out = formatMemoryFile(headerMatch.trim() || defaultHeader(), next);
  writeMemoryFile("memory", out);
  return out;
}

/** Last N entries for prompt injection. */
export function recentMemoryForPrompt(limit = 20): string {
  const entries = parseMemoryEntries(readMemoryFile("memory")).slice(0, limit);
  if (!entries.length) {
    return readMemoryFile("memory").slice(0, 2000);
  }
  return entries
    .map((e) => {
      const lens = e.lens ? ` (${e.lens})` : "";
      return `### [${e.date}] ${e.title}${lens}\n${e.body}`;
    })
    .join("\n\n")
    .slice(0, 4000);
}

/** Append a preference bullet under ## Preferences in USER.md */
export function appendUserPreference(line: string): void {
  const raw = readMemoryFile("user");
  const bullet = `- ${line.replace(/^[-*]\s*/, "").trim()}`;
  if (raw.includes(bullet)) return;
  if (/## Preferences/i.test(raw)) {
    writeMemoryFile(
      "user",
      raw.replace(/(## Preferences[^\n]*\n)/i, `$1${bullet}\n`),
    );
    return;
  }
  writeMemoryFile("user", raw.trimEnd() + `\n\n## Preferences\n${bullet}\n`);
}

void ENTRY_RE;
