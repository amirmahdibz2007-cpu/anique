import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";

export type ApprovalMode = "suggest" | "allowlist" | "auto";
export type ProviderId = "openrouter" | "openai" | "anthropic" | "ollama" | "custom";

export interface AniqueConfig {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  defaultLens: string;
  approvalMode: ApprovalMode;
  maxSteps: number;
  /** Prefer TUI when launching bare `anique` */
  ui: "tui" | "classic";
  /** Safe bash prefixes auto-approved in allowlist mode */
  allowlistBash: string[];
  /** Evidence-gated learning proposals after missions */
  learning: "on" | "off";
  /** Reply + chrome language; fa also uses cleaner terminal Persian shaping */
  locale: "en" | "fa";
}

export const PROVIDER_PRESETS: Record<
  Exclude<ProviderId, "custom">,
  { baseUrl: string; model: string; needsKey: boolean; label: string }
> = {
  openrouter: {
    label: "OpenRouter (many models, one key)",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4",
    needsKey: true,
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
    needsKey: true,
  },
  anthropic: {
    label: "Anthropic (OpenAI-compatible gateway if set)",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    needsKey: true,
  },
  ollama: {
    label: "Ollama (local, free)",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    needsKey: false,
  },
};

const DEFAULTS: AniqueConfig = {
  provider: "openrouter",
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "",
  defaultLens: "code",
  approvalMode: "suggest",
  maxSteps: 40,
  ui: "tui",
  allowlistBash: ["git ", "npm ", "pnpm ", "yarn ", "node ", "npx ", "ls ", "cat ", "head ", "rg ", "grep ", "tsc", "pytest", "cargo "],
  learning: "on",
  locale: "en",
};

export function aniqueHome(): string {
  return process.env.ANIQUE_HOME?.trim() || join(homedir(), ".anique");
}

export function ensureAniqueHome(): string {
  const home = aniqueHome();
  for (const sub of [
    "",
    "lenses",
    "private",
    "private/lenses",
    "private/projects",
    "skills",
    "skills/code",
    "skills/daily",
    "skills/write",
    "skills/teach",
    "skills/market",
    "skills/bot",
    "skills/system",
    "skills/evolve",
    "skills/atelier",
    "templates",
    "sessions",
    "exports",
    "versions",
  ]) {
    const p = sub ? join(home, sub) : home;
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  return home;
}

export function configPath(): string {
  return join(aniqueHome(), "config.json");
}

export function loadConfig(): AniqueConfig {
  ensureAniqueHome();
  const path = configPath();
  if (!existsSync(path)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<AniqueConfig>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(partial: Partial<AniqueConfig>): AniqueConfig {
  ensureAniqueHome();
  const next = { ...loadConfig(), ...partial };
  const path = configPath();
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows may ignore chmod
  }
  return next;
}

export function applyProviderPreset(
  provider: ProviderId,
  extras?: Partial<AniqueConfig>,
): AniqueConfig {
  if (provider === "custom") {
    return saveConfig({ provider, ...extras });
  }
  const preset = PROVIDER_PRESETS[provider];
  return saveConfig({
    provider,
    baseUrl: preset.baseUrl,
    model: extras?.model ?? preset.model,
    apiKey: extras?.apiKey ?? (provider === "ollama" ? "ollama" : loadConfig().apiKey),
    ...extras,
  });
}

export function resolveProviderUrls(
  provider: ProviderId,
  baseUrl?: string,
): string {
  if (baseUrl?.trim()) return baseUrl.trim().replace(/\/$/, "");
  if (provider === "custom") return "http://127.0.0.1:1234/v1";
  return PROVIDER_PRESETS[provider]?.baseUrl ?? PROVIDER_PRESETS.openrouter.baseUrl;
}

export function isConfigured(config = loadConfig()): boolean {
  if (config.provider === "ollama" && config.model?.trim()) return true;
  return Boolean(config.apiKey?.trim() && config.model?.trim());
}
