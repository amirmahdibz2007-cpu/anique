import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  cpSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";

/**
 * Lightweight "named project" registry — a distinctive name bound to one or
 * more workspace directories, sharing durable project memory + chat history
 * grouping, while still inheriting the global USER.md / MEMORY.md context.
 *
 * This is intentionally separate from `anique project init/use` (full
 * ANIQUE_HOME profile switch) — named projects only group memory + sessions,
 * they never change provider/model/API key.
 */
export interface NamedProject {
  id: string;
  name: string;
  /** Absolute directories bound to this project. */
  paths: string[];
  createdAt: string;
}

interface Registry {
  projects: NamedProject[];
}

function registryPath(): string {
  ensureAniqueHome();
  return join(aniqueHome(), "projects.json");
}

function loadRegistry(): Registry {
  const p = registryPath();
  if (!existsSync(p)) return { projects: [] };
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<Registry>;
    return { projects: Array.isArray(raw.projects) ? raw.projects : [] };
  } catch {
    return { projects: [] };
  }
}

function saveRegistry(reg: Registry): void {
  writeFileSync(registryPath(), JSON.stringify(reg, null, 2) + "\n", "utf8");
}

function slugify(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "project";
}

function uniqueId(name: string, existing: NamedProject[]): string {
  const base = slugify(name);
  if (!existing.some((p) => p.id === base)) return base;
  // Collision: append a short stable hash suffix derived from the name.
  const suffix = createHash("sha1").update(name).digest("hex").slice(0, 5);
  let candidate = `${base}-${suffix}`;
  let n = 0;
  while (existing.some((p) => p.id === candidate)) {
    n += 1;
    candidate = `${base}-${suffix}${n}`;
  }
  return candidate;
}

export function listNamedProjects(): NamedProject[] {
  return loadRegistry().projects;
}

export function getNamedProject(idOrName: string): NamedProject | null {
  const q = idOrName.trim().toLowerCase();
  const reg = loadRegistry();
  return (
    reg.projects.find((p) => p.id === q) ??
    reg.projects.find((p) => p.name.trim().toLowerCase() === q) ??
    null
  );
}

/** Longest-prefix match: exact path, or an ancestor directory bound to a project. */
export function findProjectForPath(path: string): NamedProject | null {
  const target = resolve(path);
  const reg = loadRegistry();
  let best: NamedProject | null = null;
  let bestLen = -1;
  for (const p of reg.projects) {
    for (const bound of p.paths) {
      const b = resolve(bound);
      const isMatch = target === b || target.startsWith(b + sep);
      if (isMatch && b.length > bestLen) {
        best = p;
        bestLen = b.length;
      }
    }
  }
  return best;
}

export function projectStoreDirForId(id: string): string {
  ensureAniqueHome();
  const dir = join(aniqueHome(), "private", "projects", id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Copy an existing unnamed (hash-keyed) project store into the new named one, if present. */
function migrateHashStore(oldHashDir: string, newDir: string): void {
  if (!existsSync(oldHashDir) || oldHashDir === newDir) return;
  try {
    for (const f of readdirSync(oldHashDir)) {
      const dest = join(newDir, f);
      if (!existsSync(dest)) {
        cpSync(join(oldHashDir, f), dest, { recursive: true });
      }
    }
  } catch {
    /* best-effort */
  }
}

export function createNamedProject(
  name: string,
  path: string,
  opts?: { migrateFromHashDir?: string },
): NamedProject {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name required.");
  const reg = loadRegistry();
  const abs = resolve(path);

  const existingHere = findProjectForPath(abs);
  if (existingHere) {
    throw new Error(
      `This directory is already part of project "${existingHere.name}" (${existingHere.id}). Use /project bind or /project rename instead.`,
    );
  }

  const id = uniqueId(trimmed, reg.projects);
  const entry: NamedProject = {
    id,
    name: trimmed,
    paths: [abs],
    createdAt: new Date().toISOString(),
  };
  reg.projects.push(entry);
  saveRegistry(reg);

  const dir = projectStoreDirForId(id);
  if (opts?.migrateFromHashDir) {
    migrateHashStore(opts.migrateFromHashDir, dir);
  }
  return entry;
}

export function bindPathToProject(idOrName: string, path: string): NamedProject {
  const proj = getNamedProject(idOrName);
  if (!proj) throw new Error(`Unknown project: ${idOrName}`);
  const abs = resolve(path);
  const already = findProjectForPath(abs);
  if (already && already.id !== proj.id) {
    throw new Error(
      `This directory already belongs to project "${already.name}" (${already.id}).`,
    );
  }
  if (!proj.paths.includes(abs)) {
    const reg = loadRegistry();
    const target = reg.projects.find((p) => p.id === proj.id)!;
    target.paths.push(abs);
    saveRegistry(reg);
    return target;
  }
  return proj;
}

export function unbindPath(path: string): NamedProject | null {
  const abs = resolve(path);
  const reg = loadRegistry();
  const proj = reg.projects.find((p) => p.paths.some((b) => resolve(b) === abs));
  if (!proj) return null;
  proj.paths = proj.paths.filter((b) => resolve(b) !== abs);
  saveRegistry(reg);
  return proj;
}

export function renameNamedProject(idOrName: string, newName: string): NamedProject {
  const proj = getNamedProject(idOrName);
  if (!proj) throw new Error(`Unknown project: ${idOrName}`);
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("New name required.");
  const reg = loadRegistry();
  const target = reg.projects.find((p) => p.id === proj.id)!;
  target.name = trimmed;
  saveRegistry(reg);
  return target;
}

/** Resolve the storage key (named project id, or a stable path hash) for a workspace. */
export function resolveProjectStoreKey(workspace: string): {
  key: string;
  project: NamedProject | null;
} {
  const project = findProjectForPath(workspace);
  if (project) return { key: project.id, project };
  const hash = createHash("sha1").update(resolve(workspace)).digest("hex").slice(0, 12);
  return { key: hash, project: null };
}
