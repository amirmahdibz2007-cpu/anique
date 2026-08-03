import { createInterface } from "node:readline";
import chalk from "chalk";
import {
  applyProviderPreset,
  loadConfig,
  saveConfig,
  PROVIDER_PRESETS,
  aniqueHome,
  type ProviderId,
  type ApprovalMode,
} from "../config/index.js";
import { writeMemoryFile, readMemoryFile } from "../memory/files.js";
import { listLensIds } from "../lenses/index.js";

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

/** Interactive first-run setup — works for anyone. */
export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    chalk.bold("\n  ◆ Anique setup") +
      chalk.dim("  — 2 minutes, then you're ready\n"),
  );

  console.log(chalk.bold("Provider"));
  const providers = Object.entries(PROVIDER_PRESETS);
  providers.forEach(([id, p], i) => {
    console.log(`  ${i + 1}) ${id.padEnd(12)} ${p.label}`);
  });
  console.log(`  ${providers.length + 1}) custom       Your own OpenAI-compatible base URL`);

  const pick = (await ask(rl, chalk.cyan("Choose [1]: "))).trim() || "1";
  const idx = Number(pick) - 1;
  let provider: ProviderId = "openrouter";
  if (idx >= 0 && idx < providers.length) {
    provider = providers[idx]![0] as Exclude<ProviderId, "custom">;
  } else if (idx === providers.length) {
    provider = "custom";
  }

  if (provider === "custom") {
    const baseUrl =
      (await ask(rl, "Base URL [http://127.0.0.1:1234/v1]: ")).trim() ||
      "http://127.0.0.1:1234/v1";
    const model =
      (await ask(rl, "Model name: ")).trim() || "local-model";
    const apiKey =
      (await ask(rl, "API key (or 'none'): ")).trim() || "none";
    saveConfig({
      provider: "custom",
      baseUrl,
      model,
      apiKey: apiKey === "none" ? "local" : apiKey,
    });
  } else {
    const preset = PROVIDER_PRESETS[provider];
    const model =
      (await ask(rl, `Model [${preset.model}]: `)).trim() || preset.model;
    let apiKey = loadConfig().apiKey;
    if (preset.needsKey) {
      apiKey =
        (await ask(rl, "API key: ")).trim() || apiKey;
      if (!apiKey) {
        console.log(chalk.yellow("No key yet — you can set it later: anique config set apiKey …"));
      }
    } else {
      apiKey = "ollama";
    }
    applyProviderPreset(provider, { model, apiKey });
  }

  console.log(chalk.bold("\nDefaults"));
  console.log(`Lenses: ${listLensIds().join(", ")}`);
  const lens =
    (await ask(rl, "Default lens [code]: ")).trim() || "code";
  const approvalRaw =
    (await ask(rl, "Approval mode suggest|auto [suggest]: ")).trim() ||
    "suggest";
  const approvalMode = (
    approvalRaw === "auto" ? "auto" : "suggest"
  ) as ApprovalMode;

  saveConfig({ defaultLens: lens, approvalMode, ui: "tui" });

  console.log(chalk.bold("\nAbout you (optional — makes Anique better for YOU)"));
  console.log(
    chalk.dim(
      "Stored in ~/.anique/USER.md — language, tone, projects. Leave blank to skip.",
    ),
  );
  const name = (await ask(rl, "Name / handle: ")).trim();
  const langs =
    (await ask(rl, "Languages you use (e.g. Persian, English): ")).trim() ||
    "English";
  const focus = (
    await ask(
      rl,
      "Main work (code / writing / teaching / bots / mixed): ",
    )
  ).trim() || "mixed";
  const notes = (await ask(rl, "Anything else Anique should remember: ")).trim();

  const userMd = `# USER

- Name: ${name || "(not set)"}
- Languages: ${langs}
- Focus: ${focus}
${notes ? `- Notes: ${notes}` : ""}

## Preferences
- Be direct and concrete.
- Match my language when I write in it.
- Ask before destructive system changes.

## Context
Add project names, bot handles, publication style, or constraints here anytime
with: anique memory user
`;
  writeMemoryFile("user", userMd);

  if (!readMemoryFile("memory").includes("Project")) {
    writeMemoryFile(
      "memory",
      `# MEMORY\n\nShort durable notes across sessions.\n\n## Active projects\n\n- \n`,
    );
  }

  const cfg = loadConfig();
  console.log(chalk.green("\n✓ Setup saved"));
  console.log(chalk.dim(`  home:     ${aniqueHome()}`));
  console.log(chalk.dim(`  provider: ${cfg.provider}`));
  console.log(chalk.dim(`  model:    ${cfg.model}`));
  console.log(chalk.dim(`  lens:     ${cfg.defaultLens}`));
  console.log(`\nNext: ${chalk.bold("anique")}  or  ${chalk.bold("anique doctor")}\n`);
  rl.close();
}
