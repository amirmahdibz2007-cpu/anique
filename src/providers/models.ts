import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  aniqueHome,
  ensureAniqueHome,
  loadConfig,
  saveConfig,
  applyProviderPreset,
  PROVIDER_PRESETS,
  type AniqueConfig,
  type ProviderId,
} from "../config/index.js";

export interface ModelInfo {
  id: string;
  name?: string;
  context?: number;
}

/** Popular aliases people expect (Hermes-style shortcuts). */
export const MODEL_ALIASES: Record<string, string> = {
  sonnet: "anthropic/claude-sonnet-4",
  opus: "anthropic/claude-opus-4",
  haiku: "anthropic/claude-haiku-4.5",
  gpt: "openai/gpt-4.1",
  "gpt-fast": "openai/gpt-4.1-mini",
  gemini: "google/gemini-2.5-pro",
  deepseek: "deepseek/deepseek-chat",
  qwen: "qwen/qwen3-coder",
  local: "llama3.2",
  cheap: "openai/gpt-4.1-mini",
  strong: "anthropic/claude-opus-4",
};

const CURATED: Record<ProviderId, string[]> = {
  openrouter: [
    "anthropic/claude-sonnet-4",
    "anthropic/claude-opus-4",
    "openai/gpt-4.1",
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-pro",
    "deepseek/deepseek-chat",
    "qwen/qwen3-coder",
    "meta-llama/llama-4-maverick",
  ],
  openai: ["gpt-4.1", "gpt-4.1-mini", "o4-mini", "o3"],
  anthropic: [
    "claude-sonnet-4-20250514",
    "claude-opus-4-20250514",
    "claude-haiku-4-5-20251001",
  ],
  ollama: ["llama3.2", "qwen2.5-coder", "deepseek-coder-v2", "mistral"],
  custom: [],
};

function recentPath(): string {
  ensureAniqueHome();
  return join(aniqueHome(), "recent-models.json");
}

export function loadRecentModels(): string[] {
  const p = recentPath();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")) as string[];
  } catch {
    return [];
  }
}

export function pushRecentModel(model: string): void {
  const next = [model, ...loadRecentModels().filter((m) => m !== model)].slice(
    0,
    12,
  );
  writeFileSync(recentPath(), JSON.stringify(next, null, 2) + "\n", "utf8");
}

export function resolveModelId(input: string, config = loadConfig()): string {
  const raw = input.trim();
  if (!raw) return config.model;
  const lower = raw.toLowerCase();
  if (MODEL_ALIASES[lower]) return MODEL_ALIASES[lower]!;
  // provider:model form
  if (raw.includes(":") && !raw.includes("/")) {
    const [prov, ...rest] = raw.split(":");
    const model = rest.join(":");
    if (prov && model && prov in PROVIDER_PRESETS) {
      return model;
    }
  }
  return raw;
}

export function switchModel(
  modelInput: string,
  opts?: { provider?: ProviderId; persist?: boolean },
): AniqueConfig {
  const model = resolveModelId(modelInput);
  let cfg = loadConfig();
  if (opts?.provider) {
    cfg = applyProviderPreset(opts.provider, { model });
  } else if (opts?.persist !== false) {
    cfg = saveConfig({ model });
  } else {
    // session-only: caller keeps in memory; still update recent
    cfg = { ...cfg, model };
  }
  pushRecentModel(model);
  return cfg;
}

export async function fetchProviderModels(
  config = loadConfig(),
): Promise<ModelInfo[]> {
  const curated = CURATED[config.provider] ?? [];
  const base: ModelInfo[] = curated.map((id) => ({ id }));

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/models`, {
      headers: {
        Authorization: `Bearer ${config.apiKey || "ollama"}`,
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return base;
    const data = (await res.json()) as {
      data?: Array<{ id: string; name?: string; context_length?: number }>;
    };
    const remote = (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      context: m.context_length,
    }));
    if (!remote.length) return base;
    // Prefer curated order, then fill with remote matches / extras
    const seen = new Set<string>();
    const out: ModelInfo[] = [];
    for (const id of curated) {
      const hit = remote.find((r) => r.id === id) ?? { id };
      out.push(hit);
      seen.add(id);
    }
    for (const r of remote.slice(0, 40)) {
      if (!seen.has(r.id)) {
        out.push(r);
        seen.add(r.id);
      }
    }
    return out;
  } catch {
    return base;
  }
}

export function formatModelList(
  models: ModelInfo[],
  current: string,
  recent: string[],
): string {
  const lines: string[] = [];
  if (recent.length) {
    lines.push("Recent:");
    for (const id of recent.slice(0, 5)) {
      lines.push(`  ${id === current ? "→" : " "} ${id}`);
    }
    lines.push("");
  }
  lines.push("Available:");
  for (const m of models.slice(0, 25)) {
    const mark = m.id === current ? "→" : " ";
    const ctx = m.context ? `  (${Math.round(m.context / 1000)}k)` : "";
    lines.push(`  ${mark} ${m.id}${ctx}`);
  }
  lines.push("");
  lines.push("Aliases: " + Object.keys(MODEL_ALIASES).join(", "));
  return lines.join("\n");
}
