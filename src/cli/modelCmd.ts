import { createInterface } from "node:readline";
import chalk from "chalk";
import { ModelsFlow } from "../providers/modelsFlow.js";
import { isModelReady } from "../providers/profiles.js";
import { loadConfig, saveConfig } from "../config/index.js";
import { pushRecentModel, resolveModelId } from "../providers/models.js";

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

/**
 * Hermes-style /models setup: provider → endpoint/key → model.
 * Also used by `anique models` / `anique model`.
 */
export async function runModelWizard(opts?: {
  forceAddProvider?: boolean;
  /** Quick set: anique model sonnet */
  quickModel?: string;
}): Promise<void> {
  if (opts?.quickModel && isModelReady()) {
    const model = resolveModelId(opts.quickModel);
    saveConfig({ model });
    pushRecentModel(model);
    console.log(chalk.green("model →"), model);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const flow = new ModelsFlow();

  console.log(
    chalk.bold("\n  ◆ Anique /models") +
      chalk.dim("  — provider · API key · model\n"),
  );

  if (!isModelReady()) {
    console.log(chalk.yellow("model: not set\n"));
  } else {
    const cfg = loadConfig();
    console.log(
      chalk.dim(`current: ${cfg.provider} · ${cfg.model}\n`),
    );
  }

  const startMsg = await flow.start({
    forceAddProvider: opts?.forceAddProvider,
  });
  console.log(startMsg);

  while (flow.active) {
    const line = (await ask(rl, chalk.cyan("› "))).trim();
    if (!line) continue;
    const result = await flow.handle(line);
    console.log(result.message);
    if (result.done) break;
  }

  rl.close();
  if (isModelReady()) {
    const cfg = loadConfig();
    console.log(
      chalk.dim(
        `\nTip: inside chat use /models to switch, or /models + to add another API.\n` +
          `Active: ${cfg.model}\n`,
      ),
    );
  }
}
