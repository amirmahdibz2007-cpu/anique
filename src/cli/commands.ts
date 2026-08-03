import { createInterface } from "node:readline";
import { cwd } from "node:process";
import { resolve, join, dirname, basename } from "node:path";
import {
  writeFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import chalk from "chalk";
import {
  loadConfig,
  saveConfig,
  resolveProviderUrls,
  applyProviderPreset,
  aniqueHome,
  ensureAniqueHome,
  isConfigured,
  type AniqueConfig,
  type ProviderId,
} from "../config/index.js";
import { describeLenses, getLens, listLensIds } from "../lenses/index.js";
import { runAgent, type Rhythm } from "../agent/loop.js";
import {
  exportSessionMarkdown,
  getSession,
  getTraces,
  listSessions,
  recall,
} from "../store/db.js";
import { runSetup } from "./setup.js";
import { runDoctor } from "./doctor.js";
import { runModelWizard } from "./modelCmd.js";
import { replayTrace } from "../theater/missionTheater.js";
import { saveSkill, listSkills } from "../skills/index.js";
import { readMemoryFile, writeMemoryFile } from "../memory/files.js";
import { aniqueSourceRoot } from "../meta/sourceRoot.js";
import type { ChatMessage } from "../providers/types.js";
import { getLastEvidencePack } from "../learn/lastMission.js";
import { runLearningPass } from "../learn/runLearning.js";
import {
  fetchProviderModels,
  formatModelList,
  loadRecentModels,
  resolveModelId,
  pushRecentModel,
} from "../providers/models.js";
import { ModelsFlow } from "../providers/modelsFlow.js";
import { isModelReady } from "../providers/profiles.js";
import { currentProfileName } from "../profiles/agentProfiles.js";
import {
  createProfile,
  deleteProfile,
  formatProfileList,
  getProfile,
  renameProfile,
  useProfile,
} from "../profiles/agentProfiles.js";
import { resetDb } from "../store/db.js";
import { compactHistory, formatContextBar } from "../agent/usage.js";
import { formatTodos } from "../agent/todos.js";
import { undoLastSnapshot } from "../agent/undo.js";

function banner(lens: string, rhythm: Rhythm, workspace: string): void {
  const profile = currentProfileName();
  console.log(
    chalk.bold.white("\n  ◆ ANIQUE") +
      chalk.dim(`  profile=`) +
      chalk.magenta(profile) +
      chalk.dim(`  lens=`) +
      chalk.cyan(lens) +
      chalk.dim(`  rhythm=`) +
      chalk.blue(rhythm) +
      chalk.dim(`  cwd=`) +
      chalk.dim(workspace) +
      "\n",
  );
}

function printHelpSlash(): void {
  console.log(`
${chalk.bold("Slash commands")}
  /help              Show this help
  /models            Configure provider + API key + model (Hermes-style)
  /models <id>       Quick-switch model when already configured
  /models +          Add another provider / API key
  /deep <prompt>     Force quality path (clarify + plan + sequential tasks)
  /fast <prompt>     Skip deep — single-pass answer
  /lean              Toggle lean mode (extreme token saving for rest of session)
  /lean off          Disable lean mode
  /profile           List agent profiles · /profile use <name>
  /lens <name>       Switch lens (${listLensIds().join(", ")})
  /atelier           Private deep-coding lens (not public)
  /ingest [deep]     Scan workspace into durable project memory
  /plan  /act        Rhythm: investigate vs execute
  /cost              Session token / $ estimate
  /context           Context window bar
  /compact           Summarize older history to free context
  /todos             Show mission todos
  /undo              Revert last agent file changes (git)
  /permissions       suggest | allowlist | auto
  /trace /sessions /resume /export
  /skill save <name> /evolve /clear /quit
  /learn             Propose learnings from last mission (LearnCard)
  /learn on|off      Sticky auto-learn after missions
  /fa  /en           Persian / English replies (UI stays English)
  /compose  /send    Edit ~/.anique/inbox.md in a GUI editor, then send
  /private           Owner careful profile (not public default)
  /versions          List prior file versions · /rollback <id>
  /redo              Resend last user message
`);
}

export function registerCommands(program: Command): void {
  const profileCmd = program
    .command("profile")
    .description("Manage isolated agent profiles (Hermes-style homes)");

  profileCmd
    .command("list")
    .description("List agent profiles")
    .action(() => {
      console.log(formatProfileList());
    });

  profileCmd
    .command("create")
    .description("Create a new agent profile")
    .argument("<name>", "Profile name (becomes ~/.local/bin/<name>)")
    .option("--clone", "Clone config/providers/skills/memory from default")
    .option("--clone-from <name>", "Clone from a specific profile")
    .option("--description <text>", "Short description")
    .action(
      (
        name: string,
        opts: { clone?: boolean; cloneFrom?: string; description?: string },
      ) => {
        const meta = createProfile({
          name,
          clone: opts.clone || Boolean(opts.cloneFrom),
          cloneFrom: opts.cloneFrom,
          description: opts.description,
        });
        console.log(chalk.green(`✓ profile → ${meta.name}`));
        console.log(chalk.dim(`  home:  ${meta.path}`));
        console.log(chalk.dim(`  alias: ~/.local/bin/${meta.name}`));
        console.log(
          chalk.dim(
            `  try:   ${meta.name} models   or   anique -p ${meta.name}`,
          ),
        );
      },
    );

  profileCmd
    .command("show")
    .description("Show profile details")
    .argument("<name>", "Profile name")
    .action((name: string) => {
      const p = getProfile(name === "default" ? "default" : name);
      if (!p) {
        console.error("Unknown profile:", name);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(p, null, 2));
    });

  profileCmd
    .command("use")
    .description("Set sticky default profile for bare anique")
    .argument("<name>", "Profile name (or default)")
    .action((name: string) => {
      const p = useProfile(name);
      resetDb();
      console.log(chalk.green(`active profile → ${p.name}`));
      console.log(chalk.dim(p.path));
    });

  profileCmd
    .command("delete")
    .description("Delete a named profile")
    .argument("<name>", "Profile name")
    .option("--yes", "Confirm deletion")
    .action((name: string, opts: { yes?: boolean }) => {
      try {
        deleteProfile(name, { yes: opts.yes });
        resetDb();
        console.log(chalk.green(`deleted profile ${name}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  profileCmd
    .command("rename")
    .description("Rename a profile")
    .argument("<from>", "Current name")
    .argument("<to>", "New name")
    .action((from: string, to: string) => {
      const p = renameProfile(from, to);
      console.log(chalk.green(`renamed → ${p.name}`));
    });

  profileCmd.action(() => {
    console.log(chalk.bold("Profiles"));
    console.log(formatProfileList());
    console.log(
      chalk.dim(
        "\n  anique profile create coder [--clone] [--description \"…\"]\n" +
          "  anique profile use coder\n" +
          "  anique -p coder repl\n",
      ),
    );
  });

  program
    .command("models")
    .alias("model")
    .description(
      "Configure provider + API key + model (/models). Optional: anique models <id> | anique models +",
    )
    .argument("[modelId]", "Quick-set model id/alias, or + to add provider")
    .option("--list", "List models from current provider and exit")
    .action(
      async (
        modelId: string | undefined,
        opts: { list?: boolean },
      ) => {
        if (opts.list) {
          const cfg = loadConfig();
          const models = await fetchProviderModels(cfg);
          console.log(formatModelList(models, cfg.model, loadRecentModels()));
          return;
        }
        if (modelId === "+" || modelId === "add") {
          await runModelWizard({ forceAddProvider: true });
          return;
        }
        if (modelId) {
          await runModelWizard({ quickModel: modelId });
          return;
        }
        await runModelWizard();
      },
    );

  program
    .command("doctor")
    .description("Health-check Node, config, DB, lenses, provider reachability")
    .action(async () => {
      const code = await runDoctor();
      process.exitCode = code;
    });

  program
    .command("repl")
    .description("Interactive Anique session — TUI by default (Cursor-like terminal UI)")
    .option("-l, --lens <name>", "Starting lens")
    .option("-w, --workspace <path>", "Workspace directory", cwd())
    .option("--plan", "Start in plan rhythm")
    .option("--classic", "Plain readline REPL instead of TUI")
    .option("-s, --session <id>", "Resume session id")
    .action(
      async (opts: {
        lens?: string;
        workspace: string;
        plan?: boolean;
        classic?: boolean;
        session?: string;
      }) => {
        const cfg = loadConfig();
        if (!isConfigured(cfg)) {
          console.log(
            chalk.yellow("model: not set — run ") +
              chalk.bold("anique models") +
              chalk.yellow(" or type /models inside chat."),
          );
        }
        let lens = opts.lens || cfg.defaultLens;
        let workspace = resolve(opts.workspace);
        if (opts.session) {
          const ses = getSession(opts.session);
          if (ses) {
            lens = opts.lens || ses.lens;
            workspace = opts.workspace !== cwd() ? workspace : ses.workspace;
          }
        }
        const state = {
          lens,
          workspace,
          rhythm: (opts.plan ? "plan" : "act") as Rhythm,
          sessionId: opts.session,
        };
        const useClassic =
          opts.classic || cfg.ui === "classic" || !process.stdout.isTTY;
        if (useClassic) {
          await runRepl(state);
          return;
        }
        const { startTui } = await import("../tui/App.js");
        await startTui(state);
      },
    );

  program
    .command("tui")
    .description("Open the graphical terminal UI (same as default anique)")
    .option("-l, --lens <name>", "Starting lens")
    .option("-w, --workspace <path>", "Workspace directory", cwd())
    .option("--plan", "Start in plan rhythm")
    .option("-s, --session <id>", "Resume session id")
    .action(
      async (opts: {
        lens?: string;
        workspace: string;
        plan?: boolean;
        session?: string;
      }) => {
        const { startTui } = await import("../tui/App.js");
        await startTui({
          lens: opts.lens || loadConfig().defaultLens,
          workspace: resolve(opts.workspace),
          rhythm: opts.plan ? "plan" : "act",
          sessionId: opts.session,
        });
      },
    );

  program
    .command("ask")
    .description("One-shot question / task")
    .argument("<prompt...>", "Prompt text")
    .option("-l, --lens <name>", "Lens")
    .option("-w, --workspace <path>", "Workspace", cwd())
    .option("--plan", "Plan rhythm")
    .action(
      async (
        promptParts: string[],
        opts: { lens?: string; workspace: string; plan?: boolean },
      ) => {
        const config = loadConfig();
        const lens = opts.lens || config.defaultLens;
        const workspace = resolve(opts.workspace);
        banner(lens, opts.plan ? "plan" : "act", workspace);
        const result = await runAgent({
          config,
          lensId: lens,
          workspace,
          userMessage: promptParts.join(" "),
          rhythm: opts.plan ? "plan" : "act",
        });
        console.log(
          chalk.dim(`\nsession ${result.sessionId} · steps ${result.steps}`),
        );
      },
    );

  program
    .command("mission")
    .description("Run a mission with live theater timeline")
    .argument("<prompt...>", "Mission prompt")
    .option("-l, --lens <name>", "Lens")
    .option("-w, --workspace <path>", "Workspace", cwd())
    .option("--plan", "Plan rhythm")
    .option("--max-steps <n>", "Override max steps")
    .action(
      async (
        promptParts: string[],
        opts: {
          lens?: string;
          workspace: string;
          plan?: boolean;
          maxSteps?: string;
        },
      ) => {
        const config = loadConfig();
        if (opts.maxSteps) config.maxSteps = Number(opts.maxSteps);
        const lens = opts.lens || config.defaultLens;
        const workspace = resolve(opts.workspace);
        console.log(chalk.bold("\n══ Mission Theater ══"));
        banner(lens, opts.plan ? "plan" : "act", workspace);
        const result = await runAgent({
          config,
          lensId: lens,
          workspace,
          userMessage: promptParts.join(" "),
          rhythm: opts.plan ? "plan" : "act",
        });
        console.log(
          chalk.dim(
            `\nmission complete · session ${result.sessionId} · tools ${result.toolCallCount} · steps ${result.steps}`,
          ),
        );
        if (result.toolCallCount >= 4) {
          console.log(
            chalk.yellow(
              "Tip: reopen with `anique` then `/skill save <name>` to keep the approach.",
            ),
          );
        }
      },
    );

  program
    .command("evolve")
    .description(
      "Self-upgrade Anique: workspace locks to Anique source, evolve lens active",
    )
    .argument("[prompt...]", "What to improve (optional → opens REPL)")
    .option("--plan", "Plan first (recommended for big changes)")
    .option(
      "--source <path>",
      "Override Anique source root (default: this install)",
    )
    .action(
      async (
        promptParts: string[],
        opts: { plan?: boolean; source?: string },
      ) => {
        const source = opts.source
          ? resolve(opts.source)
          : aniqueSourceRoot();
        const prompt = promptParts.join(" ").trim();
        console.log(
          chalk.bold("\n══ Evolve ══") +
            chalk.dim("  Anique may rewrite itself under approval gates\n"),
        );
        console.log(chalk.dim(`source → ${source}`));

        if (!prompt) {
          if (process.stdout.isTTY) {
            const { startTui } = await import("../tui/App.js");
            await startTui({
              lens: "evolve",
              workspace: source,
              rhythm: opts.plan ? "plan" : "act",
            });
          } else {
            await runRepl({
              lens: "evolve",
              workspace: source,
              rhythm: opts.plan ? "plan" : "act",
            });
          }
          return;
        }

        const config = loadConfig();
        banner("evolve", opts.plan ? "plan" : "act", source);
        const result = await runAgent({
          config,
          lensId: "evolve",
          workspace: source,
          userMessage: prompt,
          rhythm: opts.plan ? "plan" : "act",
        });
        console.log(
          chalk.dim(
            `\nevolve session ${result.sessionId} · steps ${result.steps}`,
          ),
        );
        console.log(
          chalk.yellow(
            "If src/ changed: restart anique after a successful rebuild_anique.",
          ),
        );
      },
    );

  program
    .command("lens")
    .description("List lenses or show one")
    .argument("[name]", "Lens id")
    .action((name?: string) => {
      if (!name) {
        console.log(chalk.bold("Lenses\n") + describeLenses());
        return;
      }
      const lens = getLens(name);
      console.log(chalk.bold(`${lens.title} (${lens.id})`));
      console.log(lens.description);
      console.log(chalk.dim("tools: " + lens.tools.join(", ")));
    });

  const configCmd = program
    .command("config")
    .description("View or set configuration");

  configCmd
    .command("show")
    .description("Show config (api key masked)")
    .action(() => {
      const c = loadConfig();
      const masked =
        c.apiKey.length > 8
          ? `${c.apiKey.slice(0, 4)}…${c.apiKey.slice(-4)}`
          : c.apiKey
            ? "****"
            : "(not set)";
      console.log(JSON.stringify({ ...c, apiKey: masked }, null, 2));
    });

  configCmd
    .command("set")
    .description("Set a config value")
    .argument(
      "<key>",
      "apiKey | provider | baseUrl | model | defaultLens | approvalMode | maxSteps | ui",
    )
    .argument("<value>", "Value")
    .action((key: string, value: string) => {
      const aliases: Record<string, keyof AniqueConfig> = {
        apikey: "apiKey",
        apiKey: "apiKey",
        provider: "provider",
        baseurl: "baseUrl",
        baseUrl: "baseUrl",
        model: "model",
        defaultlens: "defaultLens",
        defaultLens: "defaultLens",
        approvalmode: "approvalMode",
        approvalMode: "approvalMode",
        maxsteps: "maxSteps",
        maxSteps: "maxSteps",
        ui: "ui",
      };
      const k = aliases[key] ?? aliases[key.toLowerCase()];
      if (!k) {
        console.error("Unknown key:", key);
        process.exit(1);
      }
      if (k === "provider") {
        const provider = value as ProviderId;
        if (
          provider === "openrouter" ||
          provider === "openai" ||
          provider === "anthropic" ||
          provider === "ollama"
        ) {
          applyProviderPreset(provider);
        } else {
          saveConfig({
            provider: "custom",
            baseUrl: resolveProviderUrls("custom"),
          });
        }
        console.log(chalk.green("Saved provider preset"), value);
        return;
      }
      const partial: Partial<AniqueConfig> = {};
      if (k === "maxSteps") partial.maxSteps = Number(value);
      else if (k === "approvalMode") {
        if (!["suggest", "allowlist", "auto"].includes(value)) {
          console.error("approvalMode must be suggest | allowlist | auto");
          process.exit(1);
        }
        partial.approvalMode = value as AniqueConfig["approvalMode"];
      } else if (k === "ui") {
        partial.ui = value === "classic" ? "classic" : "tui";
      } else if (k === "apiKey") partial.apiKey = value;
      else if (k === "baseUrl") partial.baseUrl = value;
      else if (k === "model") partial.model = value;
      else if (k === "defaultLens") partial.defaultLens = value;

      saveConfig(partial);
      console.log(chalk.green("Saved"), chalk.dim(aniqueHome() + "/config.json"));
    });

  program
    .command("sessions")
    .description("List recent sessions")
    .action(() => {
      const rows = listSessions(30);
      if (!rows.length) {
        console.log(chalk.dim("No sessions yet."));
        return;
      }
      for (const s of rows) {
        console.log(
          `${chalk.cyan(s.id)}  ${chalk.yellow(s.lens.padEnd(7))}  ${chalk.dim(s.updated_at.slice(0, 19))}  ${s.title}`,
        );
      }
    });

  program
    .command("resume")
    .description("Resume the latest (or given) session in TUI")
    .argument("[sessionId]", "Session id")
    .action(async (sessionId?: string) => {
      const id = sessionId || listSessions(1)[0]?.id;
      if (!id) {
        console.log(chalk.dim("No sessions yet."));
        return;
      }
      const ses = getSession(id);
      if (!ses) {
        console.error("Session not found:", id);
        process.exit(1);
      }
      const { startTui } = await import("../tui/App.js");
      await startTui({
        lens: ses.lens,
        workspace: ses.workspace,
        rhythm: "act",
        sessionId: id,
      });
    });

  program
    .command("export")
    .description("Export a session to ~/.anique/exports/<id>.md")
    .argument("[sessionId]", "Session id (default: latest)")
    .action((sessionId?: string) => {
      const id = sessionId || listSessions(1)[0]?.id;
      if (!id) {
        console.log(chalk.dim("No sessions yet."));
        return;
      }
      ensureAniqueHome();
      const md = exportSessionMarkdown(id);
      const path = join(aniqueHome(), "exports", `${id}.md`);
      writeFileSync(path, md, "utf8");
      console.log(chalk.green("Exported"), path);
    });

  program
    .command("lenses-reset")
    .description("Re-copy shipped lens packs into ~/.anique/lenses (overwrites)")
    .action(() => {
      ensureAniqueHome();
      const here = dirname(fileURLToPath(import.meta.url));
      const shipped = join(here, "..", "..", "lenses");
      const dest = join(aniqueHome(), "lenses");
      if (!existsSync(shipped)) {
        console.error("Shipped lenses not found at", shipped);
        process.exit(1);
      }
      for (const file of readdirSync(shipped)) {
        if (!file.endsWith(".md")) continue;
        copyFileSync(join(shipped, file), join(dest, file));
        console.log(chalk.dim("updated"), file);
      }
      console.log(chalk.green("Lens packs reset →"), dest);
    });

  program
    .command("trace")
    .description("Replay a mission trace")
    .argument("[sessionId]", "Session id (default: latest)")
    .action((sessionId?: string) => {
      let id = sessionId;
      if (!id) {
        const latest = listSessions(1)[0];
        if (!latest) {
          console.log("No sessions.");
          return;
        }
        id = latest.id;
      }
      const session = getSession(id);
      if (!session) {
        console.error("Session not found:", id);
        process.exit(1);
      }
      console.log(
        chalk.dim(
          `session ${session.id} · lens ${session.lens} · ${session.title}`,
        ),
      );
      replayTrace(getTraces(id));
    });

  program
    .command("recall")
    .description("Search past session messages")
    .argument("<query...>", "Search query")
    .action((parts: string[]) => {
      const hits = recall(parts.join(" "), 15);
      if (!hits.length) {
        console.log(chalk.dim("No matches."));
        return;
      }
      for (const h of hits) {
        console.log(
          `${chalk.cyan(h.session_id)} ${chalk.yellow(h.lens)} ${chalk.bold(h.title)}`,
        );
        console.log(
          chalk.dim("  " + h.content.slice(0, 160).replace(/\n/g, " ")),
        );
      }
    });

  program
    .command("skills")
    .description("List skills for a lens")
    .argument("[lens]", "Lens id")
    .action((lens?: string) => {
      const id = lens || loadConfig().defaultLens;
      const skills = listSkills(id);
      console.log(skills.length ? skills.join("\n") : chalk.dim("(none)"));
    });

  program
    .command("skill-save")
    .description("Save a skill markdown file")
    .argument("<lens>", "Lens id")
    .argument("<name>", "Skill name")
    .argument("<content...>", "Skill body")
    .action((lens: string, name: string, content: string[]) => {
      const path = saveSkill(lens, name, content.join(" "));
      console.log(chalk.green("Saved skill:"), path);
    });

  program
    .command("memory")
    .description("Show or overwrite USER.md / MEMORY.md")
    .argument("[kind]", "user | memory", "user")
    .option("--set <text>", "Overwrite content")
    .action((kind: string, opts: { set?: string }) => {
      const k = kind === "memory" ? "memory" : "user";
      if (opts.set != null) {
        writeMemoryFile(k, opts.set);
        console.log(chalk.green(`Updated ${k}`));
        return;
      }
      console.log(chalk.bold(`${k.toUpperCase()}.md\n`));
      console.log(readMemoryFile(k));
    });

  const findProjectMarker = (start: string): string | null => {
    let dir = resolve(start);
    while (true) {
      const marker = join(dir, ".anique-project");
      if (existsSync(marker)) return marker;
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  };

  const readProjectMarker = (marker: string): { profile: string } => {
    const raw = JSON.parse(readFileSync(marker, "utf8")) as { profile?: unknown };
    if (typeof raw.profile !== "string" || !raw.profile.trim()) {
      throw new Error(`Invalid project marker: ${marker}`);
    }
    return { profile: raw.profile };
  };

  program
    .command("project")
    .description("Project-scoped profiles (auto-switch per directory)")
    .addCommand(
      new Command("init")
        .description("Create a project profile for the current directory")
        .option("-d, --description <text>", "Project description")
        .action(async (opts) => {
          const dir = cwd();
          const name = basename(dir).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
          const marker = join(dir, ".anique-project");
          if (existsSync(marker)) {
            console.log(chalk.yellow("Project profile already initialized here"));
            return;
          }
          const meta = createProfile({
            name,
            description: opts.description || `Project: ${basename(dir)}`,
            clone: true,
            cloneFrom: "default",
          });
          writeFileSync(marker, JSON.stringify({ profile: name }), "utf8");
          console.log(chalk.green(`Created project profile "${name}" at ${meta.path}`));
          console.log(chalk.dim(`Marker written to ${marker}`));
        }),
    )
    .addCommand(
      new Command("use")
        .description("Switch to the project profile for the current directory")
        .action(() => {
          const marker = findProjectMarker(cwd());
          if (!marker) {
            console.log(chalk.red("No project profile here. Run 'anique project init' first."));
            process.exit(1);
          }
          const { profile } = readProjectMarker(marker);
          useProfile(profile);
          console.log(chalk.green(`Switched to project profile: ${profile}`));
        }),
    )
    .addCommand(
      new Command("auto")
        .description("Auto-detect and use project profile for current directory (for shell hooks)")
        .action(() => {
          const marker = findProjectMarker(cwd());
          if (!marker) process.exit(0); // silent: no project profile
          const { profile } = readProjectMarker(marker);
          useProfile(profile);
          // Print profile name so shell can show it in prompt
          console.log(profile);
        }),
    )
    .addCommand(
      new Command("status")
        .description("Show current project profile status")
        .action(() => {
          const marker = findProjectMarker(cwd());
          if (!marker) {
            console.log(chalk.dim("No project profile in this directory"));
            return;
          }
          const { profile } = readProjectMarker(marker);
          const meta = getProfile(profile);
          if (!meta) {
            console.log(chalk.red(`Project profile "${profile}" not found`));
            return;
          }
          console.log(chalk.bold(`Project profile: ${profile}`));
          console.log(chalk.dim(`  Path: ${meta.path}`));
          console.log(chalk.dim(`  Description: ${meta.description || "(none)"}`));
          console.log(chalk.dim(`  Created: ${meta.createdAt}`));
          const current = currentProfileName();
          if (current === profile) {
            console.log(chalk.green("  Status: ACTIVE"));
          } else {
            console.log(chalk.yellow(`  Status: INACTIVE (current: ${current})`));
            console.log(chalk.dim("  Run 'anique project use' to activate"));
          }
        }),
    );
}

async function runRepl(state: {
  lens: string;
  workspace: string;
  rhythm: Rhythm;
  sessionId?: string;
}): Promise<void> {
  let sessionId: string | undefined = state.sessionId;
  let history: ChatMessage[] = [];
  let lastAssistant = "";
  const modelsFlow = new ModelsFlow();
  let modelsMode = false;

  banner(state.lens, state.rhythm, state.workspace);
  if (!isModelReady()) {
    console.log(
      chalk.yellow("model: not set") +
        chalk.dim(" — type /models to choose provider, API key, then model\n"),
    );
  } else {
    const cfg = loadConfig();
    console.log(chalk.dim(`model: ${cfg.model} · /models to switch\n`));
  }
  console.log(chalk.dim("Type a task, or /help · Ctrl+C to exit\n"));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.bold("anique› "),
  });
  rl.prompt();

  rl.on("line", (line) => {
    void (async () => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      try {
        if (modelsMode) {
          const flowInput = input.startsWith("/") ? input.slice(1) : input;
          if (
            input.startsWith("/") &&
            !/^(cancel|exit|quit)$/i.test(flowInput)
          ) {
            modelsFlow.cancel();
            modelsMode = false;
          } else {
            const result = await modelsFlow.handle(flowInput);
            console.log(result.message);
            if (result.done) modelsMode = false;
            rl.prompt();
            return;
          }
        }

        if (input.startsWith("/")) {
          const [cmd, ...rest] = input.slice(1).split(/\s+/);
          switch (cmd) {
            case "help":
              printHelpSlash();
              break;
            case "quit":
            case "exit":
              rl.close();
              return;
            case "models":
            case "model": {
              const arg = rest.join(" ").trim();
              if (arg && !arg.startsWith("+") && isModelReady()) {
                const model = resolveModelId(arg);
                saveConfig({ model });
                pushRecentModel(model);
                console.log(chalk.green(`model → ${model}`));
                break;
              }
              const msg = await modelsFlow.start({
                forceAddProvider: arg === "+" || arg === "add",
              });
              console.log(msg);
              modelsMode = true;
              break;
            }
            case "deep":
            case "fast": {
              const mode = cmd === "deep" ? "force" : "off";
              const p = rest.join(" ").trim();
              if (!p) {
                console.log(`Usage: /${cmd} <prompt>`);
                break;
              }
              if (!isModelReady()) {
                console.log(
                  chalk.yellow(
                    "model: not set — type /models to configure a provider",
                  ),
                );
                break;
              }
              rl.pause();
              const result = await runAgent({
                config: loadConfig(),
                lensId: state.lens,
                workspace: state.workspace,
                userMessage: p,
                rhythm: state.rhythm,
                sessionId,
                history,
                deepMode: mode as "force" | "off",
                onDeepStatus: (m) => console.error(chalk.dim(m)),
              });
              sessionId = result.sessionId;
              lastAssistant = result.finalText;
              history = result.messages.filter((m) => m.role !== "system");
              console.log(
                chalk.dim(
                  `\n— ${result.sessionId} · ${result.steps} steps · /trace\n`,
                ),
              );
              rl.resume();
              break;
            }
            case "profile": {
              const sub = rest[0];
              if (!sub || sub === "list") {
                console.log(formatProfileList());
                break;
              }
              if (sub === "use" && rest[1]) {
                const p = useProfile(rest[1]);
                resetDb();
                history = [];
                sessionId = undefined;
                console.log(chalk.green(`profile → ${p.name}`));
                banner(state.lens, state.rhythm, state.workspace);
                break;
              }
              console.log("Usage: /profile | /profile use <name>");
              break;
            }
            case "lens": {
              const name = rest[0];
              if (!name) {
                console.log(describeLenses());
                break;
              }
              getLens(name);
              state.lens = name;
              console.log(chalk.green(`lens → ${name}`));
              banner(state.lens, state.rhythm, state.workspace);
              break;
            }
            case "atelier": {
              const { ensureAtelierLens, ATELIER_LENS_ID } = await import(
                "../lenses/privateLenses.js"
              );
              ensureAtelierLens();
              getLens(ATELIER_LENS_ID);
              state.lens = ATELIER_LENS_ID;
              console.log(
                chalk.magenta(
                  `lens → atelier [private]\nRun /ingest to learn this repo permanently.`,
                ),
              );
              banner(state.lens, state.rhythm, state.workspace);
              break;
            }
            case "ingest": {
              const { runTool } = await import("../tools/registry.js");
              const deep = rest[0] === "deep";
              const result = await runTool(
                "project_ingest",
                JSON.stringify({ deep }),
                {
                  workspace: state.workspace,
                  lens: state.lens || "atelier",
                  approvalMode: loadConfig().approvalMode,
                  rhythm: state.rhythm,
                },
              );
              console.log(result.output);
              if (state.lens !== "atelier") {
                const { ensureAtelierLens, ATELIER_LENS_ID } = await import(
                  "../lenses/privateLenses.js"
                );
                ensureAtelierLens();
                state.lens = ATELIER_LENS_ID;
                console.log(chalk.magenta("switched → atelier"));
              }
              break;
            }
            case "plan":
              state.rhythm = "plan";
              console.log(chalk.blue("rhythm → plan"));
              break;
            case "act":
              state.rhythm = "act";
              console.log(chalk.blue("rhythm → act"));
              break;
            case "trace": {
              const id = rest[0] || sessionId;
              if (!id) {
                console.log("No session yet.");
                break;
              }
              replayTrace(getTraces(id));
              break;
            }
            case "sessions":
              for (const s of listSessions(15)) {
                console.log(`${s.id}  ${s.lens}  ${s.title}`);
              }
              break;
            case "skills":
              console.log(listSkills(state.lens).join("\n") || "(none)");
              break;
            case "evolve": {
              state.lens = "evolve";
              state.workspace = aniqueSourceRoot();
              console.log(
                chalk.magenta(
                  `evolve mode · workspace locked to ${state.workspace}`,
                ),
              );
              banner(state.lens, state.rhythm, state.workspace);
              const evolvePrompt = rest.join(" ").trim();
              if (evolvePrompt) {
                rl.pause();
                const result = await runAgent({
                  config: loadConfig(),
                  lensId: "evolve",
                  workspace: state.workspace,
                  userMessage: evolvePrompt,
                  rhythm: state.rhythm,
                  sessionId,
                  history,
                });
                sessionId = result.sessionId;
                lastAssistant = result.finalText;
                history = result.messages.filter((m) => m.role !== "system");
                console.log(
                  chalk.dim(
                    `\n— ${result.sessionId} · ${result.steps} steps · restart after rebuild\n`,
                  ),
                );
                rl.resume();
              }
              break;
            }
            case "skill": {
              if (rest[0] === "save" && rest[1]) {
                if (!lastAssistant) {
                  console.log("No assistant reply to save yet.");
                  break;
                }
                const path = saveSkill(
                  state.lens,
                  rest[1],
                  `# Skill: ${rest[1]}\n\n${lastAssistant}\n`,
                );
                console.log(chalk.green("Saved"), path);
              } else {
                console.log("Usage: /skill save <name>");
              }
              break;
            }
            case "learn": {
              const arg = (rest[0] || "").toLowerCase();
              if (arg === "off" || arg === "on") {
                saveConfig({ learning: arg });
                console.log(chalk.cyan(`learning → ${arg}`));
                break;
              }
              const pack = getLastEvidencePack();
              if (!pack) {
                console.log("No last mission to learn from yet.");
                break;
              }
              rl.pause();
              try {
                const lr = await runLearningPass({
                  config: loadConfig(),
                  pack,
                  force: true,
                  onEvent: (ev) => console.log(chalk.magenta(ev.summary)),
                });
                if (lr.applied.length) {
                  console.log(
                    chalk.green("kept"),
                    lr.applied.map((a) => `${a.kind}:${a.title}`).join(", "),
                  );
                }
              } catch (err) {
                console.log(chalk.red(String(err)));
              } finally {
                rl.resume();
              }
              break;
            }
            case "fa":
            case "فارسی": {
              saveConfig({ locale: "fa" });
              const { ensureInbox, openInboxExternal, inboxPath } = await import(
                "../compose/inbox.js"
              );
              ensureInbox();
              const opened = openInboxExternal();
              console.log(
                chalk.cyan(
                  `fa-reply on · UI English\nCompose Persian in: ${opened.path}\nOpened: ${opened.how} · then /send\n(inbox: ${inboxPath()})`,
                ),
              );
              break;
            }
            case "en":
            case "english": {
              saveConfig({ locale: "en" });
              console.log(chalk.cyan("Replies: English"));
              break;
            }
            case "compose":
            case "inbox": {
              const { openInboxExternal } = await import("../compose/inbox.js");
              const opened = openInboxExternal();
              console.log(
                chalk.cyan(
                  `Edit ${opened.path} (${opened.how}), then /send`,
                ),
              );
              break;
            }
            case "send": {
              const {
                readInboxMessage,
                clearInbox,
                archiveInbox,
                inboxPath,
              } = await import("../compose/inbox.js");
              const body = readInboxMessage();
              if (!body.trim()) {
                console.log(`Inbox empty: ${inboxPath()}`);
                break;
              }
              archiveInbox(body);
              clearInbox();
              rl.pause();
              try {
                const result = await runAgent({
                  config: loadConfig(),
                  lensId: state.lens,
                  workspace: state.workspace,
                  userMessage: body,
                  rhythm: state.rhythm,
                  sessionId,
                  history,
                });
                sessionId = result.sessionId;
                lastAssistant = result.finalText;
                history = result.messages.filter((m) => m.role !== "system");
              } finally {
                rl.resume();
              }
              break;
            }
            case "private": {
              const { activatePrivateProfile } = await import(
                "../profiles/privateCare.js"
              );
              const { activateProfileEnv } = await import(
                "../profiles/agentProfiles.js"
              );
              const info = activatePrivateProfile();
              activateProfileEnv(info.name);
              history = [];
              sessionId = undefined;
              console.log(
                chalk.magenta(
                  `private careful → ${info.path}\n/versions · /rollback <id> · /profile use default to leave`,
                ),
              );
              break;
            }
            case "versions": {
              const { listVersions } = await import("../versions/vault.js");
              for (const r of listVersions(15)) {
                console.log(
                  `${r.id}  ${r.bytes}b  ${r.originalPath}`,
                );
              }
              break;
            }
            case "rollback": {
              const { rollbackVersion } = await import("../versions/vault.js");
              const id = rest[0];
              if (!id) {
                console.log("Usage: /rollback <id>");
                break;
              }
              const r = rollbackVersion(id);
              console.log(r.ok ? chalk.green(r.message) : chalk.red(r.message));
              break;
            }
            case "redo":
            case "retry": {
              const lastUser = [...history]
                .reverse()
                .find((m) => m.role === "user")?.content;
              if (!lastUser?.trim()) {
                console.log("Nothing to redo yet.");
                break;
              }
              while (history.length && history[history.length - 1]!.role !== "user") {
                history.pop();
              }
              if (history.length && history[history.length - 1]!.role === "user") {
                history.pop();
              }
              console.log(chalk.dim("redo · " + lastUser.slice(0, 80)));
              rl.pause();
              try {
                const result = await runAgent({
                  config: loadConfig(),
                  lensId: state.lens,
                  workspace: state.workspace,
                  userMessage: lastUser,
                  rhythm: state.rhythm,
                  sessionId,
                  history,
                });
                sessionId = result.sessionId;
                lastAssistant = result.finalText;
                history = result.messages.filter((m) => m.role !== "system");
              } catch (err) {
                console.log(chalk.red(String(err)));
              } finally {
                rl.resume();
              }
              break;
            }
            case "memory":
              console.log(
                chalk.bold("USER.md\n") + readMemoryFile("user").slice(0, 500),
              );
              console.log(
                chalk.bold("\nMEMORY.md\n") +
                  readMemoryFile("memory").slice(0, 500),
              );
              break;
            case "config": {
              const c = loadConfig();
              console.log({
                provider: c.provider,
                model: c.model,
                baseUrl: c.baseUrl,
                defaultLens: c.defaultLens,
                approvalMode: c.approvalMode,
                hasKey: Boolean(c.apiKey),
              });
              break;
            }
            case "clear":
              history = [];
              sessionId = undefined;
              console.log(chalk.dim("History cleared."));
              break;
            case "lean": {
              const arg = (rest[0] || "").toLowerCase();
              if (arg === "off") {
                saveConfig({ leanMode: false });
                console.log(chalk.cyan("lean mode OFF · normal token usage restored"));
                break;
              }
              saveConfig({ leanMode: true });
              console.log(
                chalk.cyan(
                  "lean mode ON · extreme token saving\n" +
                  "• replies capped at 512 tokens • history compacts aggressively • learning skipped\n" +
                  "/lean off to restore",
                ),
              );
              break;
            }
            default:
              console.log("Unknown command. /help");
          }
          rl.prompt();
          return;
        }

        if (!isModelReady()) {
          console.log(
            chalk.yellow(
              "model: not set — type /models to configure a provider",
            ),
          );
          rl.prompt();
          return;
        }

        rl.pause();
        const result = await runAgent({
          config: loadConfig(),
          lensId: state.lens,
          workspace: state.workspace,
          userMessage: input,
          rhythm: state.rhythm,
          sessionId,
          history,
        });
        sessionId = result.sessionId;
        lastAssistant = result.finalText;
        history = result.messages.filter((m) => m.role !== "system");
        console.log(
          chalk.dim(
            `\n— ${result.sessionId} · ${result.steps} steps · /trace\n`,
          ),
        );
      } catch (err) {
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err)),
        );
      }
      rl.resume();
      rl.prompt();
    })();
  });

  await new Promise<void>((resolvePromise) => {
    rl.on("close", () => {
      console.log(chalk.dim("\nbye."));
      resolvePromise();
    });
  });
}
