import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve, relative, isAbsolute, basename } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { globSync } from "glob";
import type { ToolDefinition } from "../providers/types.js";
import {
  askApprovalDecision,
  applyApprovalDecision,
  askWebSearchPermission,
  classifyBash,
  classifyWrite,
  hasSessionAllow,
  hasWorkspaceWriteAllow,
  isSessionUnlocked,
  needsApproval,
  sessionAllowKey,
  type RiskLevel,
} from "../safety/approval.js";
import type { ApprovalMode } from "../config/index.js";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";
import {
  readMemoryFile,
  writeMemoryFile,
  type MemoryKind,
} from "../memory/files.js";
import { loadSkill, listSkills } from "../skills/index.js";
import {
  formatTodos,
  todoUpdate,
  todoWrite,
} from "../agent/todos.js";

export interface ToolContext {
  workspace: string;
  lens: string;
  approvalMode: ApprovalMode;
  rhythm: "plan" | "act";
  allowlistBash?: string[];
  onApproval?: (msg: string) => void;
  signal?: AbortSignal;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  risk?: RiskLevel;
  denied?: boolean;
}

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

function resolveInWorkspace(workspace: string, p: string): string {
  if (isAbsolute(p)) return resolve(p);
  return resolve(workspace, p);
}

/* -- sudo / privilege escalation queue -------------------------------- */
/**
 * Commands that need a password the agent does not have. The agent keeps
 * doing everything it can, then surfaces these to the user at the end.
 */
const pendingSudo: Array<{ command: string; error: string }> = [];

export function pendingSudoCommands(): Array<{ command: string; error: string }> {
  return [...pendingSudo];
}

export function clearPendingSudo(): void {
  pendingSudo.length = 0;
}

function isSudoish(command: string): boolean {
  return /\b(sudo|doas)\b/.test(command);
}

/**
 * Attempt a privileged command non-interactively (no password prompt).
 * Returns { ran, output, error } — ran is false when a password is required.
 */
function tryRunPrivileged(command: string, cwd: string): { ran: boolean; output: string; error?: string } {
  const cmd = command.trim();
  // Non-interactive sudo: -n means never prompt. Fails fast if a password is needed.
  const nonInteractive = cmd.startsWith("sudo ")
    ? "sudo -n " + cmd.slice("sudo ".length)
    : cmd.startsWith("doas ")
      ? "doas -n " + cmd.slice("doas ".length)
      : cmd;
  try {
    const out = execSync(nonInteractive, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2_000_000,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ran: true, output: out || "(no output)" };
  } catch (err) {
    const e = err as { stderr?: string; message?: string; status?: number };
    const detail = [e.stderr, e.message].filter(Boolean).join("\n").trim();
    const wantsPassword =
      /password|authentication|sudo: a password|permission denied/i.test(detail);
    if (wantsPassword) {
      return {
        ran: false,
        output: "",
        error: detail.slice(0, 200) || "requires elevated privileges",
      };
    }
    // Some other failure (binary missing, etc.) — report it as ran but erroring.
    return { ran: true, output: "", error: detail.slice(0, 200) || "command error" };
  }
}

async function gate(
  risk: RiskLevel,
  ctx: ToolContext,
  description: string,
  opts?: { command?: string; alwaysPrefix?: string; tool?: string },
): Promise<boolean> {
  const sessionKey = sessionAllowKey(risk, description);
  if (hasSessionAllow(sessionKey)) return true;
  if (isSessionUnlocked()) return true; // trusted session — no more prompts
  if (risk === "workspace_write" && hasWorkspaceWriteAllow()) return true;

  if (
    !needsApproval(risk, ctx.approvalMode, ctx.rhythm, {
      command: opts?.command,
      allowlist: ctx.allowlistBash,
    })
  ) {
    return true;
  }
  ctx.onApproval?.(description);
  const decision = await askApprovalDecision({
    prompt: `Allow ${description}?`,
    risk,
    tool: opts?.tool,
    preview: opts?.command ?? description,
    permissionMode: ctx.approvalMode,
  });
  return applyApprovalDecision(decision, {
    sessionKey,
    alwaysPrefix: opts?.alwaysPrefix,
  });
}

const handlers: Record<string, ToolHandler> = {
  async read_file(args, ctx) {
    const path = resolveInWorkspace(ctx.workspace, String(args.path ?? ""));
    if (!existsSync(path)) {
      return { ok: false, output: `File not found: ${path}` };
    }
    const max = Number(args.max_bytes ?? 200_000);
    const content = readFileSync(path, "utf8");
    const sliced = content.length > max ? content.slice(0, max) + "\n…[truncated]" : content;
    return { ok: true, output: sliced, risk: "safe" };
  },

  async write_file(args, ctx) {
    const path = resolveInWorkspace(ctx.workspace, String(args.path ?? ""));
    const content = String(args.content ?? "");
    const risk = classifyWrite(path, ctx.workspace);
    if (!(await gate(risk, ctx, `write ${path}`, { tool: "write_file" }))) {
      return { ok: false, output: "Write denied by user.", risk, denied: true };
    }
    const { savePriorVersion } = await import("../versions/vault.js");
    const vid = savePriorVersion(path, "write_file");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
    return {
      ok: true,
      output: `Wrote ${content.length} bytes to ${path}${vid ? ` · prior saved ${vid}` : ""}`,
      risk,
    };
  },

  async apply_patch(args, ctx) {
    const path = resolveInWorkspace(ctx.workspace, String(args.path ?? ""));
    const oldText = String(args.old_text ?? "");
    const newText = String(args.new_text ?? "");
    if (!existsSync(path)) {
      return { ok: false, output: `File not found: ${path}` };
    }
    const current = readFileSync(path, "utf8");
    let matchIdx = current.indexOf(oldText);
    let matched = oldText;
    // Resilient match: try normalized newlines / trimmed trailing spaces per line
    if (matchIdx < 0 && oldText.trim()) {
      const norm = (s: string) =>
        s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
      const curN = norm(current);
      const oldN = norm(oldText);
      const ni = curN.indexOf(oldN);
      if (ni >= 0) {
        // Map back approximately by searching a unique first line
        const firstLine = oldText.split("\n").find((l) => l.trim()) ?? oldText.slice(0, 40);
        matchIdx = current.indexOf(firstLine);
        if (matchIdx >= 0 && curN.includes(oldN)) {
          matched = oldText;
          // Prefer exact normalized replace on normalized content
          const risk = classifyWrite(path, ctx.workspace);
          if (!(await gate(risk, ctx, `patch ${path}`, { tool: "apply_patch" }))) {
            return { ok: false, output: "Patch denied by user.", risk, denied: true };
          }
          const { savePriorVersion } = await import("../versions/vault.js");
          const vid = savePriorVersion(path, "apply_patch");
          const next = curN.replace(oldN, norm(newText));
          writeFileSync(path, next, "utf8");
          return {
            ok: true,
            output: `Patched ${path} (normalized match)${vid ? ` · prior saved ${vid}` : ""}`,
            risk,
          };
        }
      }
      // Helpful context for the model
      const needle = oldText.slice(0, 80).replace(/\n/g, "\\n");
      const nearby = current
        .split("\n")
        .map((l, i) => ({ l, i }))
        .filter(({ l }) =>
          oldText
            .split("\n")
            .some((ol) => ol.trim() && l.includes(ol.trim().slice(0, 40))),
        )
        .slice(0, 6)
        .map(({ l, i }) => `  L${i + 1}: ${l.slice(0, 120)}`)
        .join("\n");
      return {
        ok: false,
        output: [
          "old_text not found in file (exact match required).",
          `Looking for: ${needle}${oldText.length > 80 ? "…" : ""}`,
          nearby ? `Nearby lines:\n${nearby}` : "No nearby similar lines found.",
          "Tip: re-read the file and copy exact text including whitespace.",
        ].join("\n"),
      };
    }
    if (matchIdx < 0) {
      return { ok: false, output: "old_text not found in file (exact match required)." };
    }
    const risk = classifyWrite(path, ctx.workspace);
    if (!(await gate(risk, ctx, `patch ${path}`, { tool: "apply_patch" }))) {
      return { ok: false, output: "Patch denied by user.", risk, denied: true };
    }
    const { savePriorVersion } = await import("../versions/vault.js");
    const vid = savePriorVersion(path, "apply_patch");
    const next = current.replace(matched, newText);
    writeFileSync(path, next, "utf8");
    return {
      ok: true,
      output: `Patched ${path}${vid ? ` · prior saved ${vid}` : ""}`,
      risk,
    };
  },

  async grep(args, ctx) {
    const pattern = String(args.pattern ?? "");
    const pathArg = args.path ? String(args.path) : ".";
    const root = resolveInWorkspace(ctx.workspace, pathArg);
    const include = args.include ? String(args.include) : "";
    const caseInsensitive = Boolean(args.case_insensitive);

    // Prefer ripgrep when available
    const rgCheck = spawnSync("rg", ["--version"], { encoding: "utf8" });
    if (rgCheck.status === 0) {
      const rgArgs = [
        "--line-number",
        "--no-heading",
        "--color",
        "never",
        "--max-count",
        "80",
        ...(caseInsensitive ? ["-i"] : []),
        ...(include ? ["--glob", include] : []),
        "-e",
        pattern,
        root,
      ];
      const r = spawnSync("rg", rgArgs, {
        cwd: ctx.workspace,
        encoding: "utf8",
        maxBuffer: 2_000_000,
        timeout: 30_000,
      });
      // rg exit 1 = no matches; 2 = error
      if (r.status === 0 || r.status === 1) {
        const out = (r.stdout || "").trim();
        // Relativize absolute paths when possible
        const lines = out
          ? out
              .split("\n")
              .slice(0, 80)
              .map((line) => {
                if (line.startsWith(ctx.workspace + "/")) {
                  return relative(ctx.workspace, line.split(":")[0]!) +
                    ":" +
                    line.slice(line.indexOf(":") + 1);
                }
                return line;
              })
              .join("\n")
          : "No matches.";
        return { ok: true, output: lines || "No matches.", risk: "safe" };
      }
      // fall through to JS impl on rg error
    }

    let files: string[] = [];
    try {
      const st = existsSync(root) ? statSync(root) : null;
      if (st?.isFile()) files = [root];
      else {
        files = globSync(include || "**/*", {
          cwd: root,
          nodir: true,
          absolute: true,
          ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
          maxDepth: 8,
        }).slice(0, 200);
      }
    } catch (err) {
      return { ok: false, output: `grep failed: ${String(err)}` };
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern, caseInsensitive ? "i" : "");
    } catch {
      return { ok: false, output: `Invalid regex: ${pattern}` };
    }
    const hits: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]!)) {
          hits.push(`${relative(ctx.workspace, file) || file}:${i + 1}:${lines[i]}`);
          if (hits.length >= 80) break;
        }
      }
      if (hits.length >= 80) break;
    }
    return {
      ok: true,
      output: hits.length ? hits.join("\n") : "No matches.",
      risk: "safe",
    };
  },

  async glob(args, ctx) {
    const pattern = String(args.pattern ?? "**/*");
    const files = globSync(pattern, {
      cwd: ctx.workspace,
      nodir: true,
      absolute: false,
      ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    }).slice(0, 200);
    return {
      ok: true,
      output: files.length ? files.join("\n") : "No files matched.",
      risk: "safe",
    };
  },

  async bash(args, ctx) {
    const command = String(args.command ?? "");
    const risk = classifyBash(command);
    // plan mode: never run bash
    if (ctx.rhythm === "plan") {
      return {
        ok: false,
        output: "bash blocked in plan rhythm. Switch to /act to execute.",
        risk,
        denied: true,
      };
    }
    if (
      !(await gate(
        risk === "safe" ? "workspace_write" : risk,
        ctx,
        `bash: ${command}`,
        {
          command,
          tool: "bash",
          alwaysPrefix: command.split(/\s+/).slice(0, 2).join(" ") + " ",
        },
      ))
    ) {
      return { ok: false, output: "Command denied by user.", risk, denied: true };
    }
    try {
      // Privileged commands: try non-interactively first. If a password is
      // required (we don't have it), queue it and keep going — the agent can
      // finish everything else and hand the sudo list to the user at the end.
      if (isSudoish(command)) {
        const pr = tryRunPrivileged(command, ctx.workspace);
        if (pr.ran && !pr.error) {
          return { ok: true, output: pr.output || "(no output)", risk };
        }
        if (!pr.ran) {
          pendingSudo.push({ command, error: pr.error ?? "needs password" });
          return {
            ok: false,
            output:
              `[sudo] needs a password I don't have — queued for the user.\n` +
              `I'll continue with the rest; this will be handed to you at the end.\n` +
              `Run it yourself later: ${command}\n` +
              `${pr.error ?? ""}`.trim(),
            risk,
          };
        }
        // Non-password failure (binary missing, etc.) — report it directly.
        return { ok: false, output: pr.error ?? "command failed", risk };
      }
      const out = execSync(command, {
        cwd: ctx.workspace,
        encoding: "utf8",
        timeout: Number(args.timeout_ms ?? 60_000),
        maxBuffer: 2_000_000,
        shell: "/bin/bash",
      });
      return { ok: true, output: out || "(no output)", risk };
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number; message?: string };
      return {
        ok: false,
        output: [
          e.stdout,
          e.stderr,
          e.message,
          e.status != null ? `exit ${e.status}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        risk,
      };
    }
  },

  async memory_read(args) {
    const kind = String(args.kind ?? "user") as MemoryKind;
    const content = readMemoryFile(kind);
    return { ok: true, output: content || "(empty)", risk: "safe" };
  },

  async memory_write(args, ctx) {
    const kind = String(args.kind ?? "memory") as MemoryKind;
    const content = String(args.content ?? "");
    const modeRaw = String(args.mode ?? "").toLowerCase();
    // Prefer append for MEMORY; full replace only when explicitly requested
    const mode =
      modeRaw === "replace" || modeRaw === "overwrite" || modeRaw === "full"
        ? "replace"
        : kind === "memory"
          ? "append"
          : "replace";
    if (!(await gate("workspace_write", ctx, `memory_write ${kind}`))) {
      return { ok: false, output: "memory_write denied.", denied: true };
    }
    if (kind === "memory" && mode === "append") {
      const { appendMemoryEntry } = await import("../learn/memoryStore.js");
      appendMemoryEntry({
        title: String(args.title ?? "Note").slice(0, 120),
        body: content,
        lens: ctx.lens,
      });
      if (ctx.lens === "atelier" || ctx.lens === "code") {
        try {
          const { appendProjectMemory } = await import(
            "../learn/projectMemory.js"
          );
          appendProjectMemory(
            ctx.workspace,
            String(args.title ?? "Note").slice(0, 120),
            content,
          );
        } catch {
          /* ignore */
        }
      }
      return {
        ok: true,
        output: "Appended MEMORY entry.",
        risk: "workspace_write",
      };
    }
    writeMemoryFile(kind, content);
    return { ok: true, output: `Updated ${kind} memory.`, risk: "workspace_write" };
  },

  async recall(args) {
    const query = String(args.query ?? "");
    const { recall, searchEpisodes } = await import("../store/db.js");
    const msgs = recall(query, 8);
    const eps = searchEpisodes(query, 5);
    const lines = [
      "## Messages",
      ...msgs.map(
        (m) =>
          `- [${m.lens}] ${m.title}: ${m.content.slice(0, 200).replace(/\n/g, " ")}`,
      ),
      "## Episodes",
      ...eps.map(
        (e) =>
          `- [${e.lens}] ${e.title} (verified=${e.verified}): ${e.summary.slice(0, 200).replace(/\n/g, " ")}`,
      ),
    ];
    return {
      ok: true,
      output: lines.join("\n") || "(no matches)",
      risk: "safe",
    };
  },

  async project_ingest(args, ctx) {
    const {
      scanProjectTree,
      saveProjectMap,
      appendProjectMemory,
      projectStoreDir,
      readProjectMemory,
    } = await import("../learn/projectMemory.js");
    const deep = Boolean(args.deep);
    const map = scanProjectTree(ctx.workspace, {
      maxFiles: deep ? 800 : 400,
    });
    saveProjectMap(ctx.workspace, map);

    // Read a few anchor files for durable notes
    const anchors = [
      "package.json",
      "README.md",
      "ANIQUE.md",
      "PRISM.md",
      "tsconfig.json",
      "Cargo.toml",
      "pyproject.toml",
      "go.mod",
    ];
    const snippets: string[] = [];
    for (const a of anchors) {
      const p = join(ctx.workspace, a);
      if (!existsSync(p)) continue;
      try {
        const text = readFileSync(p, "utf8").slice(0, 2500);
        snippets.push(`### ${a}\n\`\`\`\n${text}\n\`\`\``);
      } catch {
        /* ignore */
      }
    }

    // Top-level src listing
    const srcDir = join(ctx.workspace, "src");
    let srcNote = "";
    if (existsSync(srcDir)) {
      try {
        const top = readdirSync(srcDir).slice(0, 40);
        srcNote = `src/ top: ${top.join(", ")}`;
      } catch {
        /* ignore */
      }
    }

    const noteBody = [
      map.summary.slice(0, 3500),
      srcNote,
      snippets.join("\n\n").slice(0, 6000),
      deep
        ? "Mode: deep scan — continue reading important modules with read_file/grep and append more MEMORY."
        : "Mode: map+anchors — call again with deep=true or read key modules next.",
    ]
      .filter(Boolean)
      .join("\n\n");

    appendProjectMemory(ctx.workspace, "Ingest map", noteBody);

    // Also mirror a short pointer into global MEMORY
    try {
      const { appendMemoryEntry } = await import("../learn/memoryStore.js");
      appendMemoryEntry({
        title: `atelier · ${basename(ctx.workspace)} ingest`,
        body: `Indexed ${map.files.length} files. Store: ${projectStoreDir(ctx.workspace)}\n${srcNote}`,
        lens: ctx.lens,
      });
    } catch {
      /* ignore */
    }

    const memLen = readProjectMemory(ctx.workspace).length;
    return {
      ok: true,
      output: [
        `Ingested workspace → ${projectStoreDir(ctx.workspace)}`,
        `Files indexed: ${map.files.length}`,
        `Project memory bytes: ${memLen}`,
        "Next: read critical modules, then memory_write append lasting notes (architecture, conventions, pitfalls).",
        map.files
          .slice(0, 25)
          .map((f) => f.path)
          .join("\n"),
      ].join("\n"),
      risk: "safe",
    };
  },

  async skill_load(args, ctx) {
    const name = String(args.name ?? "");
    const content = loadSkill(ctx.lens, name);
    if (!content) {
      const available = listSkills(ctx.lens);
      return {
        ok: false,
        output: `Skill not found. Available: ${available.join(", ") || "(none)"}`,
      };
    }
    return { ok: true, output: content, risk: "safe" };
  },

  async git_status(_args, ctx) {
    try {
      const out = execSync("git status --short --branch", {
        cwd: ctx.workspace,
        encoding: "utf8",
      });
      return { ok: true, output: out || "(clean)", risk: "safe" };
    } catch (err) {
      return { ok: false, output: String(err) };
    }
  },

  async git_diff(args, ctx) {
    const staged = Boolean(args.staged);
    try {
      const out = execSync(staged ? "git diff --staged" : "git diff", {
        cwd: ctx.workspace,
        encoding: "utf8",
        maxBuffer: 2_000_000,
      });
      return { ok: true, output: out || "(no diff)", risk: "safe" };
    } catch (err) {
      return { ok: false, output: String(err) };
    }
  },

  async git_commit(args, ctx) {
    const message = String(args.message ?? "").trim();
    if (!message) return { ok: false, output: "Commit message required." };
    if (ctx.rhythm === "plan") {
      return { ok: false, output: "git_commit blocked in plan rhythm.", denied: true };
    }
    if (!(await gate("dangerous", ctx, `git commit: ${message}`))) {
      return { ok: false, output: "Commit denied.", denied: true };
    }
    // Safer staging: only explicit paths, or already-staged files. Never git add -A by default.
    const pathsRaw = args.paths ?? args.files;
    const paths: string[] = Array.isArray(pathsRaw)
      ? pathsRaw.map(String).filter(Boolean)
      : typeof pathsRaw === "string" && pathsRaw.trim()
        ? pathsRaw.split(/[\s,]+/).filter(Boolean)
        : [];
    const stagedOnly = Boolean(args.staged_only ?? args.stagedOnly);
    try {
      if (paths.length) {
        for (const p of paths) {
          const abs = resolveInWorkspace(ctx.workspace, p);
          execSync(`git add -- ${JSON.stringify(abs)}`, {
            cwd: ctx.workspace,
            encoding: "utf8",
          });
        }
      } else if (!stagedOnly) {
        // Default: require paths or staged_only — refuse silent add -A
        const staged = execSync("git diff --cached --name-only", {
          cwd: ctx.workspace,
          encoding: "utf8",
        }).trim();
        if (!staged) {
          return {
            ok: false,
            output:
              "git_commit refused: pass paths[] to stage, or staged_only:true with already-staged files. Never uses git add -A.",
          };
        }
      }
      const stillStaged = execSync("git diff --cached --name-only", {
        cwd: ctx.workspace,
        encoding: "utf8",
      }).trim();
      if (!stillStaged) {
        return { ok: false, output: "Nothing staged to commit." };
      }
      execSync(`git commit -m ${JSON.stringify(message)}`, {
        cwd: ctx.workspace,
        encoding: "utf8",
      });
      const log = execSync("git log -1 --oneline", {
        cwd: ctx.workspace,
        encoding: "utf8",
      });
      return {
        ok: true,
        output: `Committed: ${log.trim()}\nFiles:\n${stillStaged}`,
        risk: "dangerous",
      };
    } catch (err) {
      return { ok: false, output: String(err) };
    }
  },

  async run_tests(args, ctx) {
    const cmd = String(args.command ?? "npm test");
    if (ctx.rhythm === "plan") {
      return { ok: false, output: "run_tests blocked in plan rhythm.", denied: true };
    }
    if (!(await gate("workspace_write", ctx, `run_tests: ${cmd}`))) {
      return { ok: false, output: "run_tests denied.", denied: true };
    }
    const result = spawnSync(cmd, {
      cwd: ctx.workspace,
      encoding: "utf8",
      shell: true,
      timeout: 120_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    return {
      ok: result.status === 0,
      output: output || `exit ${result.status}`,
      risk: "workspace_write",
    };
  },

  async list_templates(_args) {
    ensureAniqueHome();
    const dir = join(aniqueHome(), "templates");
    if (!existsSync(dir)) return { ok: true, output: "(no templates)", risk: "safe" };
    const files = readdirSync(dir);
    return {
      ok: true,
      output: files.length ? files.join("\n") : "(no templates)",
      risk: "safe",
    };
  },

  async read_template(args) {
    ensureAniqueHome();
    const name = String(args.name ?? "");
    const path = join(aniqueHome(), "templates", name);
    if (!existsSync(path)) return { ok: false, output: `Template not found: ${name}` };
    return { ok: true, output: readFileSync(path, "utf8"), risk: "safe" };
  },

  async read_log(args, ctx) {
    const path = resolveInWorkspace(ctx.workspace, String(args.path ?? ""));
    const lines = Number(args.tail ?? 100);
    if (!existsSync(path)) return { ok: false, output: `Log not found: ${path}` };
    const content = readFileSync(path, "utf8").split("\n");
    return {
      ok: true,
      output: content.slice(-lines).join("\n"),
      risk: "safe",
    };
  },

  async rebuild_anique(args, ctx) {
    if (ctx.rhythm === "plan") {
      return {
        ok: false,
        output: "rebuild_anique blocked in plan rhythm. Switch to /act.",
        denied: true,
      };
    }
    if (!(await gate("workspace_write", ctx, "rebuild_anique (npm run build && smoke)"))) {
      return { ok: false, output: "rebuild_anique denied.", denied: true };
    }
    const skipSmoke = Boolean(args.skip_smoke);
    const cmd = skipSmoke
      ? "npm run build"
      : "npm run build && npm run smoke";
    const result = spawnSync(cmd, {
      cwd: ctx.workspace,
      encoding: "utf8",
      shell: true,
      timeout: 180_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const hint =
      result.status === 0
        ? "\n\nRebuild OK. Restart the `anique` process to load new dist/ code. Lens markdown under ~/.anique/lenses applies on next message without restart."
        : "";
    return {
      ok: result.status === 0,
      output: (output || `exit ${result.status}`) + hint,
      risk: "workspace_write",
    };
  },

  async todo_write(args) {
    const raw = args.items;
    let items: Array<{ content: string; status?: string; id?: string }> = [];
    if (Array.isArray(raw)) {
      items = raw as Array<{ content: string; status?: string; id?: string }>;
    } else if (typeof raw === "string") {
      try {
        items = JSON.parse(raw) as typeof items;
      } catch {
        return { ok: false, output: "items must be JSON array" };
      }
    }
    if (!items.length) return { ok: false, output: "items required" };
    todoWrite(
      items.map((it) => ({
        content: String(it.content),
        status: it.status as "pending" | "in_progress" | "completed" | "cancelled" | undefined,
        id: it.id,
      })),
    );
    return { ok: true, output: formatTodos(), risk: "safe" };
  },

  async todo_list() {
    return { ok: true, output: formatTodos(), risk: "safe" };
  },

  async todo_update(args) {
    const id = String(args.id ?? "");
    const updated = todoUpdate(id, {
      content: args.content != null ? String(args.content) : undefined,
      status: args.status as "pending" | "in_progress" | "completed" | "cancelled" | undefined,
    });
    if (!updated) return { ok: false, output: `todo not found: ${id}` };
    return { ok: true, output: formatTodos(), risk: "safe" };
  },

  async web_search(args, ctx) {
    const query = String(args.query ?? "").trim();
    if (!query) return { ok: false, output: "query required" };
    // Consent to search the internet is asked only ONCE per session.
    const allowed = await askWebSearchPermission(
      `web_search: "${query.slice(0, 80)}" — may I search the internet?`,
    );
    if (!allowed) {
      return { ok: false, output: "web search denied (session consent withheld)", denied: true };
    }
    try {
      const results = await ddgSearch(query, Number(args.max_results ?? 6));
      return { ok: true, output: results, risk: "safe" };
    } catch (err) {
      return { ok: false, output: `web_search failed: ${String(err)}` };
    }
  },
};

/**
 * Minimal DuckDuckGo HTML search — no API key required.
 * Extracts result titles + snippets (+ URL when present).
 */
async function ddgSearch(query: string, max: number): Promise<string> {
  const url =
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const out: string[] = [];
  const re =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(html)) !== null && n < max) {
    const href = m[1]!;
    // DuckDuckGo wraps real links in /l/?uddg=<encoded>. Extract it if present.
    let link = href;
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg?.[1]) {
      try {
        link = decodeURIComponent(uddg[1]);
      } catch {
        link = uddg[1]!;
      }
    } else {
      try {
        link = decodeURIComponent(href);
      } catch {
        /* keep raw */
      }
    }
    const title = stripTags(m[2]!);
    const snippet = stripTags(m[3] ?? "");
    out.push(`• ${title}\n  ${snippet}\n  ${link}`);
    n++;
  }
  if (!out.length) {
    // Fallback: return any links found on the page
    const anyLink = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = anyLink.exec(html)) !== null && n < max) {
      out.push(`• ${stripTags(m[2]!)}\n  ${m[1]!}`);
      n++;
    }
  }
  if (!out.length) return "(no results)";
  return out.join("\n\n");
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getToolDefinitions(names: string[]): ToolDefinition[] {
  const catalog: Record<string, ToolDefinition> = {
    read_file: {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a text file from the workspace (or absolute path).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
            max_bytes: { type: "number", description: "Max bytes to return" },
          },
          required: ["path"],
        },
      },
    },
    write_file: {
      type: "function",
      function: {
        name: "write_file",
        description: "Write full contents to a file (creates parents).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    },
    apply_patch: {
      type: "function",
      function: {
        name: "apply_patch",
        description: "Replace an exact old_text occurrence with new_text in a file.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            old_text: { type: "string" },
            new_text: { type: "string" },
          },
          required: ["path", "old_text", "new_text"],
        },
      },
    },
    grep: {
      type: "function",
      function: {
        name: "grep",
        description: "Search files with a regex pattern.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            path: { type: "string", description: "File or directory (default .)" },
            include: { type: "string", description: "Glob include pattern" },
            case_insensitive: { type: "boolean" },
          },
          required: ["pattern"],
        },
      },
    },
    glob: {
      type: "function",
      function: {
        name: "glob",
        description: "List files matching a glob pattern in the workspace.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string" },
          },
          required: ["pattern"],
        },
      },
    },
    bash: {
      type: "function",
      function: {
        name: "bash",
        description: "Run a shell command in the workspace (requires approval when risky).",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
            timeout_ms: { type: "number" },
          },
          required: ["command"],
        },
      },
    },
    memory_read: {
      type: "function",
      function: {
        name: "memory_read",
        description: "Read persistent USER or MEMORY notes.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["user", "memory"] },
          },
          required: ["kind"],
        },
      },
    },
    memory_write: {
      type: "function",
      function: {
        name: "memory_write",
        description:
          "Write USER or MEMORY notes. MEMORY defaults to append dated entry; use mode=replace only for full overwrite.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["user", "memory"] },
            content: { type: "string" },
            title: {
              type: "string",
              description: "Entry title when appending to MEMORY",
            },
            mode: {
              type: "string",
              enum: ["append", "replace"],
              description: "MEMORY: append (default) or replace entire file",
            },
          },
          required: ["kind", "content"],
        },
      },
    },
    recall: {
      type: "function",
      function: {
        name: "recall",
        description:
          "Search past session messages and learned mission episodes for relevant notes.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    },
    project_ingest: {
      type: "function",
      function: {
        name: "project_ingest",
        description:
          "Scan the workspace tree, save a durable project map + memory for the atelier lens. Use at start of deep coding on a repo.",
        parameters: {
          type: "object",
          properties: {
            deep: {
              type: "boolean",
              description: "Index more files (slower).",
            },
          },
        },
      },
    },
    skill_load: {
      type: "function",
      function: {
        name: "skill_load",
        description: "Load a saved skill document for the active lens.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    git_status: {
      type: "function",
      function: {
        name: "git_status",
        description: "Show git status --short --branch.",
        parameters: { type: "object", properties: {} },
      },
    },
    git_diff: {
      type: "function",
      function: {
        name: "git_diff",
        description: "Show git diff (optionally staged).",
        parameters: {
          type: "object",
          properties: {
            staged: { type: "boolean" },
          },
        },
      },
    },
    git_commit: {
      type: "function",
      function: {
        name: "git_commit",
        description:
          "Create a git commit. Pass paths[] to stage specific files, or staged_only:true for already-staged files. Never runs git add -A.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string" },
            paths: {
              type: "array",
              items: { type: "string" },
              description: "Files to stage before commit",
            },
            staged_only: {
              type: "boolean",
              description: "Commit only what is already staged",
            },
          },
          required: ["message"],
        },
      },
    },
    run_tests: {
      type: "function",
      function: {
        name: "run_tests",
        description: "Run a test command in the workspace.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Default: npm test" },
          },
        },
      },
    },
    list_templates: {
      type: "function",
      function: {
        name: "list_templates",
        description: "List content templates in ~/.anique/templates.",
        parameters: { type: "object", properties: {} },
      },
    },
    read_template: {
      type: "function",
      function: {
        name: "read_template",
        description: "Read a template file by name from ~/.anique/templates.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    read_log: {
      type: "function",
      function: {
        name: "read_log",
        description: "Tail a log file for bot/system debugging.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            tail: { type: "number" },
          },
          required: ["path"],
        },
      },
    },
    rebuild_anique: {
      type: "function",
      function: {
        name: "rebuild_anique",
        description:
          "Build Anique (tsc) and run offline smoke tests. Use after evolving src/. Requires approval.",
        parameters: {
          type: "object",
          properties: {
            skip_smoke: {
              type: "boolean",
              description: "If true, only npm run build",
            },
          },
        },
      },
    },
    todo_write: {
      type: "function",
      function: {
        name: "todo_write",
        description: "Replace the mission todo list (track multi-step work).",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "string",
              description:
                'JSON array: [{"content":"...","status":"pending|in_progress|completed"}]',
            },
          },
          required: ["items"],
        },
      },
    },
    todo_list: {
      type: "function",
      function: {
        name: "todo_list",
        description: "Show current mission todos.",
        parameters: { type: "object", properties: {} },
      },
    },
    todo_update: {
      type: "function",
      function: {
        name: "todo_update",
        description: "Update one todo by id.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
            },
          },
          required: ["id"],
        },
      },
    },
    web_search: {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Search the internet for current information (news, docs, prices, facts). Asks the user for consent once per session.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            max_results: { type: "number", description: "Max results (default 6)" },
          },
          required: ["query"],
        },
      },
    },
  };

  return names.filter((n) => catalog[n]).map((n) => catalog[n]!);
}

export async function runTool(
  name: string,
  argsJson: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) {
    return { ok: false, output: `Unknown tool: ${name}` };
  }
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, output: `Invalid JSON arguments for ${name}` };
  }
  try {
    return await handler(args, ctx);
  } catch (err) {
    return { ok: false, output: `Tool ${name} crashed: ${String(err)}` };
  }
}
