import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";

const MAX_PER_FILE = 12;
const MAX_TOTAL = 200;

export interface VersionEntry {
  id: string;
  originalPath: string;
  savedAt: string;
  bytes: number;
  note?: string;
}

function versionsRoot(): string {
  ensureAniqueHome();
  const p = join(aniqueHome(), "versions");
  mkdirSync(p, { recursive: true });
  return p;
}

function indexPath(): string {
  return join(versionsRoot(), "index.json");
}

function loadIndex(): VersionEntry[] {
  const p = indexPath();
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as VersionEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveIndex(entries: VersionEntry[]): void {
  writeFileSync(indexPath(), JSON.stringify(entries.slice(0, MAX_TOTAL), null, 2) + "\n");
}

function fileKey(absPath: string): string {
  return createHash("sha1").update(absPath).digest("hex").slice(0, 12);
}

/**
 * Copy current file contents aside before overwrite/patch.
 * Returns version id, or null if nothing to save.
 */
export function savePriorVersion(
  absPath: string,
  note?: string,
): string | null {
  if (!existsSync(absPath)) return null;
  let content: Buffer;
  try {
    content = readFileSync(absPath);
  } catch {
    return null;
  }
  if (content.length === 0) return null;

  const root = versionsRoot();
  const key = fileKey(absPath);
  const dir = join(root, key);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `${key}_${stamp}`;
  const dest = join(dir, `${stamp}__${basename(absPath)}`);
  writeFileSync(dest, content);
  writeFileSync(
    dest + ".meta.json",
    JSON.stringify(
      {
        id,
        originalPath: absPath,
        savedAt: new Date().toISOString(),
        bytes: content.length,
        note: note ?? "pre-write",
        blob: dest,
      },
      null,
      2,
    ),
  );

  let entries = loadIndex().filter((e) => e.id !== id);
  entries.unshift({
    id,
    originalPath: absPath,
    savedAt: new Date().toISOString(),
    bytes: content.length,
    note,
  });

  // prune per-file
  const forFile = entries.filter((e) => e.originalPath === absPath);
  if (forFile.length > MAX_PER_FILE) {
    const drop = forFile.slice(MAX_PER_FILE);
    entries = entries.filter((e) => !drop.some((d) => d.id === e.id));
    for (const d of drop) {
      try {
        const meta = join(dir, `${d.id.split("_").slice(1).join("_")}__${basename(absPath)}.meta.json`);
        // best-effort cleanup of old blobs in dir
        for (const f of readdirSync(dir)) {
          if (f.includes(d.id.slice(13, 32)) || f.startsWith(d.savedAt.replace(/[:.]/g, "-").slice(0, 16))) {
            try {
              unlinkSync(join(dir, f));
            } catch {
              /* ignore */
            }
          }
        }
        void meta;
      } catch {
        /* ignore */
      }
    }
  }

  saveIndex(entries.slice(0, MAX_TOTAL));
  return id;
}

export function listVersions(limit = 20): VersionEntry[] {
  return loadIndex().slice(0, limit);
}

export function rollbackVersion(id: string): { ok: boolean; message: string } {
  const entries = loadIndex();
  const hit = entries.find((e) => e.id === id || e.id.startsWith(id));
  if (!hit) return { ok: false, message: `No version ${id}` };

  const key = fileKey(hit.originalPath);
  const dir = join(versionsRoot(), key);
  if (!existsSync(dir)) return { ok: false, message: "Version blob dir missing" };

  const stamp = hit.id.slice(key.length + 1);
  const blob = join(dir, `${stamp}__${basename(hit.originalPath)}`);
  if (!existsSync(blob)) {
    // fallback: newest matching meta
    const files = readdirSync(dir).filter((f) => f.endsWith(basename(hit.originalPath)));
    if (!files.length) return { ok: false, message: "Version file missing" };
    const fallback = join(dir, files.sort().reverse()[0]!);
    // save current before restore
    savePriorVersion(hit.originalPath, "pre-rollback");
    mkdirSync(dirname(hit.originalPath), { recursive: true });
    copyFileSync(fallback, hit.originalPath);
    return { ok: true, message: `Restored ${hit.originalPath} ← ${files[0]}` };
  }

  savePriorVersion(hit.originalPath, "pre-rollback");
  mkdirSync(dirname(hit.originalPath), { recursive: true });
  copyFileSync(blob, hit.originalPath);
  return { ok: true, message: `Restored ${hit.originalPath} ← ${hit.id}` };
}
