import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/** Machine-level root — always ~/.anique (not a named profile home). */
export function machineRoot(): string {
  return (
    process.env.ANIQUE_MACHINE_ROOT?.trim() || join(homedir(), ".anique")
  );
}

export interface AgentProfileMeta {
  name: string;
  path: string;
  description: string;
  createdAt: string;
}

export interface ProfileRegistry {
  /** Sticky default for bare `anique` when ANIQUE_HOME unset. "default" = machine root. */
  activeProfile: string;
  profiles: AgentProfileMeta[];
}

function registryPath(): string {
  const root = machineRoot();
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return join(root, "registry.json");
}

export function loadRegistry(): ProfileRegistry {
  const path = registryPath();
  if (!existsSync(path)) {
    return { activeProfile: "default", profiles: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ProfileRegistry;
    return {
      activeProfile: raw.activeProfile || "default",
      profiles: Array.isArray(raw.profiles) ? raw.profiles : [],
    };
  } catch {
    return { activeProfile: "default", profiles: [] };
  }
}

export function saveRegistry(reg: ProfileRegistry): void {
  writeFileSync(registryPath(), JSON.stringify(reg, null, 2) + "\n", "utf8");
}

export function defaultProfileHome(): string {
  return machineRoot();
}

export function profileHome(name: string): string {
  if (!name || name === "default") return defaultProfileHome();
  return join(machineRoot(), "profiles", sanitizeName(name));
}

function sanitizeName(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  if (!s || s === "default" || s === "profiles") {
    throw new Error(`Invalid profile name: ${name}`);
  }
  return s;
}

export function resolveHome(name?: string | null): string {
  if (!name || name === "default") return defaultProfileHome();
  return profileHome(name);
}

/** Current profile name inferred from ANIQUE_HOME / registry. */
export function currentProfileName(): string {
  const home = process.env.ANIQUE_HOME?.trim();
  const root = machineRoot();
  if (!home || home === root) {
    const reg = loadRegistry();
    return reg.activeProfile || "default";
  }
  const profilesDir = join(root, "profiles");
  if (home.startsWith(profilesDir + "/") || home.startsWith(profilesDir + "\\")) {
    return basename(home);
  }
  // Custom ANIQUE_HOME outside registry
  const reg = loadRegistry();
  const hit = reg.profiles.find((p) => p.path === home);
  return hit?.name ?? "custom";
}

/**
 * Apply sticky active profile to ANIQUE_HOME before config/db load.
 * Skips if ANIQUE_HOME already set (alias / -p already applied).
 */
export function applyActiveProfileEnv(): void {
  if (process.env.ANIQUE_HOME?.trim()) return;
  const reg = loadRegistry();
  if (!reg.activeProfile || reg.activeProfile === "default") return;
  process.env.ANIQUE_HOME = profileHome(reg.activeProfile);
}

/** Parse -p / --profile from argv; returns name or null. Mutates argv to strip flags. */
export function consumeProfileArgv(argv: string[]): string | null {
  let name: string | null = null;
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-p" || a === "--profile") {
      name = argv[++i] ?? null;
      continue;
    }
    if (a.startsWith("--profile=")) {
      name = a.slice("--profile=".length) || null;
      continue;
    }
    out.push(a);
  }
  argv.length = 0;
  argv.push(...out);
  return name;
}

export function activateProfileEnv(name: string): string {
  const home = resolveHome(name);
  if (!name || name === "default" || home === machineRoot()) {
    delete process.env.ANIQUE_HOME;
    return machineRoot();
  }
  process.env.ANIQUE_HOME = home;
  return home;
}

const CLONE_FILES = [
  "config.json",
  "providers.json",
  "USER.md",
  "MEMORY.md",
  "recent-models.json",
];

const CLONE_DIRS = ["skills", "lenses", "templates"];

export function createProfile(opts: {
  name: string;
  description?: string;
  clone?: boolean;
  cloneFrom?: string;
}): AgentProfileMeta {
  const name = sanitizeName(opts.name);
  const home = profileHome(name);
  if (existsSync(home)) {
    throw new Error(`Profile already exists: ${name} (${home})`);
  }
  mkdirSync(home, { recursive: true });

  const source = resolveHome(opts.cloneFrom ?? "default");
  if (opts.clone || opts.cloneFrom) {
    for (const f of CLONE_FILES) {
      const src = join(source, f);
      if (existsSync(src)) cpSync(src, join(home, f));
    }
    for (const d of CLONE_DIRS) {
      const src = join(source, d);
      if (existsSync(src)) cpSync(src, join(home, d), { recursive: true });
    }
  } else {
    for (const d of ["skills", "lenses", "templates", "sessions", "exports"]) {
      mkdirSync(join(home, d), { recursive: true });
    }
  }

  const meta: AgentProfileMeta = {
    name,
    path: home,
    description: opts.description?.trim() || "",
    createdAt: new Date().toISOString(),
  };
  const reg = loadRegistry();
  reg.profiles = reg.profiles.filter((p) => p.name !== name);
  reg.profiles.push(meta);
  saveRegistry(reg);
  ensureAlias(name, home);
  return meta;
}

export function listProfiles(): Array<
  AgentProfileMeta & { active: boolean; isDefault?: boolean }
> {
  const reg = loadRegistry();
  const active = reg.activeProfile || "default";
  const rows: Array<AgentProfileMeta & { active: boolean; isDefault?: boolean }> = [
    {
      name: "default",
      path: defaultProfileHome(),
      description: "Default Anique home",
      createdAt: "",
      active: active === "default",
      isDefault: true,
    },
  ];
  for (const p of reg.profiles) {
    rows.push({ ...p, active: p.name === active });
  }
  return rows;
}

export function getProfile(name: string): AgentProfileMeta | null {
  if (name === "default") {
    return {
      name: "default",
      path: defaultProfileHome(),
      description: "Default Anique home",
      createdAt: "",
    };
  }
  return loadRegistry().profiles.find((p) => p.name === name) ?? null;
}

export function useProfile(name: string): AgentProfileMeta {
  const n = name === "default" ? "default" : sanitizeName(name);
  if (n !== "default" && !getProfile(n)) {
    throw new Error(`Unknown profile: ${name}`);
  }
  const reg = loadRegistry();
  reg.activeProfile = n;
  saveRegistry(reg);
  activateProfileEnv(n);
  return getProfile(n)!;
}

export function deleteProfile(name: string, opts?: { yes?: boolean }): void {
  const n = sanitizeName(name);
  if (n === "default") throw new Error("Cannot delete the default profile");
  const meta = getProfile(n);
  if (!meta) throw new Error(`Unknown profile: ${name}`);
  if (!opts?.yes) {
    throw new Error(`Refusing to delete without --yes (would remove ${meta.path})`);
  }
  const reg = loadRegistry();
  reg.profiles = reg.profiles.filter((p) => p.name !== n);
  if (reg.activeProfile === n) reg.activeProfile = "default";
  saveRegistry(reg);
  removeAlias(n);
  if (existsSync(meta.path)) rmSync(meta.path, { recursive: true, force: true });
  if (process.env.ANIQUE_HOME === meta.path) {
    delete process.env.ANIQUE_HOME;
  }
}

export function renameProfile(from: string, to: string): AgentProfileMeta {
  const oldName = sanitizeName(from);
  const newName = sanitizeName(to);
  const meta = getProfile(oldName);
  if (!meta) throw new Error(`Unknown profile: ${from}`);
  if (getProfile(newName)) throw new Error(`Profile already exists: ${to}`);
  const newPath = profileHome(newName);
  cpSync(meta.path, newPath, { recursive: true });
  rmSync(meta.path, { recursive: true, force: true });
  removeAlias(oldName);
  const reg = loadRegistry();
  reg.profiles = reg.profiles.map((p) =>
    p.name === oldName
      ? { ...p, name: newName, path: newPath }
      : p,
  );
  if (reg.activeProfile === oldName) reg.activeProfile = newName;
  saveRegistry(reg);
  ensureAlias(newName, newPath);
  return getProfile(newName)!;
}

function aniqueEntryScript(): string {
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    // dist/profiles → dist/index.js
    const entry = join(here, "..", "index.js");
    if (existsSync(entry)) return entry;
  } catch {
    /* fall through */
  }
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("anique/package.json");
    return join(pkg, "..", "dist", "index.js");
  } catch {
    return "";
  }
}

export function ensureAlias(name: string, home: string): string {
  const binDir = join(homedir(), ".local", "bin");
  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });
  const aliasPath = join(binDir, name);
  const entry = aniqueEntryScript();
  const node = process.execPath;
  const script = entry
    ? `#!/usr/bin/env bash
# Anique profile alias: ${name}
export ANIQUE_HOME=${JSON.stringify(home)}
exec ${JSON.stringify(node)} --experimental-sqlite ${JSON.stringify(entry)} "$@"
`
    : `#!/usr/bin/env bash
export ANIQUE_HOME=${JSON.stringify(home)}
exec anique "$@"
`;
  writeFileSync(aliasPath, script, "utf8");
  try {
    chmodSync(aliasPath, 0o755);
  } catch {
    /* ignore */
  }
  return aliasPath;
}

function removeAlias(name: string): void {
  const aliasPath = join(homedir(), ".local", "bin", name);
  if (existsSync(aliasPath)) {
    try {
      rmSync(aliasPath);
    } catch {
      /* ignore */
    }
  }
}

export function formatProfileList(): string {
  const rows = listProfiles();
  return rows
    .map((p) => {
      const mark = p.active ? "→" : " ";
      const desc = p.description ? ` — ${p.description}` : "";
      return `${mark} ${p.name.padEnd(14)} ${p.path}${desc}`;
    })
    .join("\n");
}
