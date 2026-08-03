#!/usr/bin/env -S node --experimental-sqlite
import { createRequire } from "node:module";
import { Command } from "commander";
import chalk from "chalk";
import { registerCommands } from "./cli/commands.js";
import { ensureAniqueHome } from "./config/index.js";
import { seedUserLenses } from "./lenses/index.js";
import { seedTemplates } from "./cli/seed.js";
import {
  activateProfileEnv,
  applyActiveProfileEnv,
  consumeProfileArgv,
  currentProfileName,
} from "./profiles/agentProfiles.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

async function main(): Promise<void> {
  // Profile must resolve before any config/db path reads
  const fromFlag = consumeProfileArgv(process.argv);
  if (fromFlag) activateProfileEnv(fromFlag);
  else applyActiveProfileEnv();

  ensureAniqueHome();
  seedUserLenses();
  seedTemplates();

  const program = new Command();
  program
    .name("anique")
    .description(
      chalk.bold("Anique") +
        " — multi-domain agent · TUI in the terminal (lenses: code · write · teach · market · bot · system · evolve)",
    )
    .version(pkg.version)
    .option("-p, --profile <name>", "Agent profile (isolated home)")
    .hook("preAction", () => {
      // commander may still see global option if not stripped — noop safety
      void currentProfileName();
    });

  registerCommands(program);

  // Default: REPL when no args (only node + script left)
  if (process.argv.length <= 2) {
    process.argv.push("repl");
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(chalk.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
