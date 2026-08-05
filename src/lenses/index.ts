import {
  existsSync,
  readFileSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";
import {
  ensureAtelierLens,
  listPrivateLensIds,
  loadPrivateLens,
} from "./privateLenses.js";

export type BuiltinLensId =
  | "code"
  | "daily"
  | "system"
  | "teach"
  | "write"
  | "market"
  | "bot"
  | "evolve";

/** Builtin or private user lens id (e.g. atelier). */
export type LensId = BuiltinLensId | string;

export interface LensDefinition {
  id: string;
  title: string;
  description: string;
  tools: string[];
  systemPrompt: string;
  /** True for owner-only lenses under ~/.anique/private/lenses */
  private?: boolean;
}

const COMMON_TOOLS = [
  "read_file",
  "write_file",
  "apply_patch",
  "grep",
  "glob",
  "bash",
  "memory_read",
  "memory_write",
  "recall",
  "skill_load",
  "todo_write",
  "todo_list",
  "todo_update",
  "web_search",
];

const CODE_TOOLS = [
  ...COMMON_TOOLS,
  "git_status",
  "git_diff",
  "git_commit",
  "run_tests",
  "project_ingest",
];

const LENS_META: Record<
  BuiltinLensId,
  Omit<LensDefinition, "systemPrompt" | "private"> & { promptFile: string }
> = {
  code: {
    id: "code",
    title: "Code",
    description: "Repository work: edit, test, git, debug",
    tools: [...CODE_TOOLS],
    promptFile: "code.md",
  },
  daily: {
    id: "daily",
    title: "Daily",
    description: "Simple everyday tasks — quick answers, lists, drafts",
    tools: [
      "read_file",
      "write_file",
      "grep",
      "glob",
      "bash",
      "memory_read",
      "memory_write",
      "recall",
      "todo_write",
      "todo_list",
      "todo_update",
    ],
    promptFile: "daily.md",
  },
  system: {
    id: "system",
    title: "System",
    description: "Rice, configs, services — high-friction approvals",
    tools: [...COMMON_TOOLS],
    promptFile: "system.md",
  },
  teach: {
    id: "teach",
    title: "Teach",
    description: "Explanations, learning paths, drills, quizzes",
    tools: [...COMMON_TOOLS, "list_templates", "read_template"],
    promptFile: "teach.md",
  },
  write: {
    id: "write",
    title: "Write",
    description: "Journalism / magazine voice, structure, editing",
    tools: [...COMMON_TOOLS, "list_templates", "read_template"],
    promptFile: "write.md",
  },
  market: {
    id: "market",
    title: "Market",
    description: "Bot growth: copy, funnels, content calendar",
    tools: [...COMMON_TOOLS, "list_templates", "read_template"],
    promptFile: "market.md",
  },
  bot: {
    id: "bot",
    title: "Bot",
    description: "Debug and improve your bot from logs and code",
    tools: [...COMMON_TOOLS, "read_log", "git_status", "git_diff", "run_tests"],
    promptFile: "bot.md",
  },
  evolve: {
    id: "evolve",
    title: "Evolve",
    description: "Self-upgrade: read/change Anique's own code, lenses, UX",
    tools: [
      ...COMMON_TOOLS,
      "git_status",
      "git_diff",
      "git_commit",
      "run_tests",
      "rebuild_anique",
    ],
    promptFile: "evolve.md",
  },
};

function packageLensesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "lenses");
}

function readLensMarkdown(id: string, file: string): string {
  ensureAniqueHome();
  const userPath = join(aniqueHome(), "lenses", file);
  const shipped = join(packageLensesDir(), file);
  if (existsSync(userPath)) return readFileSync(userPath, "utf8");
  if (existsSync(shipped)) return readFileSync(shipped, "utf8");
  return `# ${id}\n\nYou are the ${id} lens of Anique.\n`;
}

function toolsForPrivatePreset(preset: "code" | "common"): string[] {
  return preset === "code" ? [...CODE_TOOLS] : [...COMMON_TOOLS];
}

export function listBuiltinLensIds(): BuiltinLensId[] {
  return Object.keys(LENS_META) as BuiltinLensId[];
}

export function listLensIds(): string[] {
  ensureAtelierLens();
  const priv = listPrivateLensIds().filter((id) => !(id in LENS_META));
  return [...listBuiltinLensIds(), ...priv];
}

export function getLens(id: string): LensDefinition {
  const key = id as BuiltinLensId;
  const meta = LENS_META[key];
  if (meta) {
    return {
      id: meta.id,
      title: meta.title,
      description: meta.description,
      tools: meta.tools,
      systemPrompt: readLensMarkdown(meta.id, meta.promptFile),
    };
  }

  const priv = loadPrivateLens(id, toolsForPrivatePreset);
  if (priv) return priv;

  throw new Error(
    `Unknown lens "${id}". Available: ${listLensIds().join(", ")}`,
  );
}

export function describeLenses(): string {
  return listLensIds()
    .map((id) => {
      const l = getLens(id);
      const tag = l.private ? " [private]" : "";
      return `  ${l.id.padEnd(10)} ${l.description}${tag}`;
    })
    .join("\n");
}

export function seedUserLenses(): void {
  ensureAniqueHome();
  ensureAtelierLens();
  const shipped = packageLensesDir();
  if (!existsSync(shipped)) return;
  const dest = join(aniqueHome(), "lenses");
  for (const file of readdirSync(shipped)) {
    if (!file.endsWith(".md")) continue;
    const target = join(dest, file);
    if (!existsSync(target)) {
      copyFileSync(join(shipped, file), target);
    }
  }
}
