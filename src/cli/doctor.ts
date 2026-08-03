import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import {
  loadConfig,
  isConfigured,
  aniqueHome,
  configPath,
  PROVIDER_PRESETS,
} from "../config/index.js";
import { listLensIds, getLens } from "../lenses/index.js";
import { aniqueSourceRoot } from "../meta/sourceRoot.js";
import { getDb } from "../store/db.js";

export async function runDoctor(): Promise<number> {
  let issues = 0;
  const ok = (msg: string) => console.log(chalk.green("✓"), msg);
  const warn = (msg: string) => {
    console.log(chalk.yellow("!"), msg);
  };
  const bad = (msg: string) => {
    issues += 1;
    console.log(chalk.red("✗"), msg);
  };

  console.log(chalk.bold("\n◆ Anique doctor\n"));

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 22) ok(`Node ${process.versions.node}`);
  else bad(`Node ${process.versions.node} — need >= 22 for node:sqlite`);

  const home = aniqueHome();
  if (existsSync(home)) ok(`Anique home ${home}`);
  else bad(`Missing home ${home}`);

  if (existsSync(configPath())) ok(`Config ${configPath()}`);
  else warn("No config yet — run: anique setup");

  const cfg = loadConfig();
  if (isConfigured(cfg)) ok(`Provider ${cfg.provider} / model ${cfg.model}`);
  else bad("No API key — run: anique setup  or  anique config set apiKey …");

  if (cfg.provider !== "custom" && cfg.provider in PROVIDER_PRESETS) {
    ok(`Preset known for ${cfg.provider}`);
  }

  try {
    getDb();
    ok("SQLite database opens");
  } catch (err) {
    bad(`SQLite failed: ${String(err)}`);
  }

  for (const id of listLensIds()) {
    try {
      const lens = getLens(id);
      if (lens.systemPrompt.length < 10) warn(`Lens ${id} prompt empty`);
    } catch (err) {
      bad(`Lens ${id}: ${String(err)}`);
    }
  }
  ok(`${listLensIds().length} lenses loadable`);

  const src = aniqueSourceRoot();
  if (existsSync(join(src, "package.json"))) ok(`Source root ${src}`);
  else warn(`Source root unclear (${src}) — set ANIQUE_SOURCE for evolve`);

  // Live ping (optional, short timeout)
  if (isConfigured(cfg)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok || res.status === 401 || res.status === 404) {
        ok(`Reachable ${cfg.baseUrl} (HTTP ${res.status})`);
      } else {
        warn(`Provider HTTP ${res.status} at ${cfg.baseUrl}`);
      }
    } catch {
      warn(`Could not reach ${cfg.baseUrl} (offline or blocked)`);
    }
  }

  console.log(
    issues
      ? chalk.red(`\n${issues} issue(s) found.\n`)
      : chalk.green("\nAll clear.\n"),
  );
  return issues;
}
