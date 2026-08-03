import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import {
  aniqueHome,
  ensureAniqueHome,
  loadConfig,
  saveConfig,
  PROVIDER_PRESETS,
  type ProviderId,
  type AniqueConfig,
} from "../config/index.js";
import { fetchProviderModels, pushRecentModel, type ModelInfo } from "./models.js";

export interface ProviderProfile {
  id: string;
  /** Display name */
  name: string;
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  createdAt: string;
}

export interface ProfilesStore {
  activeId: string | null;
  profiles: ProviderProfile[];
}

function profilesPath(): string {
  ensureAniqueHome();
  return join(aniqueHome(), "providers.json");
}

export function loadProfiles(): ProfilesStore {
  const path = profilesPath();
  if (!existsSync(path)) {
    // migrate from flat config if key exists
    const cfg = loadConfig();
    if (cfg.apiKey?.trim() && cfg.model?.trim()) {
      const id = cfg.provider || "default";
      const store: ProfilesStore = {
        activeId: id,
        profiles: [
          {
            id,
            name: cfg.provider,
            provider: cfg.provider,
            baseUrl: cfg.baseUrl,
            apiKey: cfg.apiKey,
            model: cfg.model,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      saveProfiles(store);
      return store;
    }
    return { activeId: null, profiles: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ProfilesStore;
  } catch {
    return { activeId: null, profiles: [] };
  }
}

export function saveProfiles(store: ProfilesStore): void {
  const path = profilesPath();
  writeFileSync(path, JSON.stringify(store, null, 2) + "\n", "utf8");
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
}

export function getActiveProfile(): ProviderProfile | null {
  const store = loadProfiles();
  if (!store.activeId) return null;
  return store.profiles.find((p) => p.id === store.activeId) ?? null;
}

/** True when user finished /models at least once with a model. */
export function isModelReady(config = loadConfig()): boolean {
  const active = getActiveProfile();
  if (active?.apiKey && active.model) return true;
  if (config.provider === "ollama" && config.model?.trim()) return true;
  return Boolean(config.apiKey?.trim() && config.model?.trim());
}

export function applyProfileToConfig(profile: ProviderProfile): AniqueConfig {
  pushRecentModel(profile.model);
  return saveConfig({
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
  });
}

export function upsertProfile(profile: ProviderProfile, makeActive = true): ProfilesStore {
  const store = loadProfiles();
  const idx = store.profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) store.profiles[idx] = profile;
  else store.profiles.push(profile);
  if (makeActive) store.activeId = profile.id;
  saveProfiles(store);
  applyProfileToConfig(profile);
  return store;
}

export function listAcceptedProviders(): Array<{
  id: ProviderId | "custom";
  label: string;
  needsKey: boolean;
  needsEndpoint: boolean;
  defaultEndpoint: string;
}> {
  return [
    {
      id: "openrouter",
      label: "OpenRouter — one key, many models",
      needsKey: true,
      needsEndpoint: false,
      defaultEndpoint: PROVIDER_PRESETS.openrouter.baseUrl,
    },
    {
      id: "openai",
      label: "OpenAI",
      needsKey: true,
      needsEndpoint: false,
      defaultEndpoint: PROVIDER_PRESETS.openai.baseUrl,
    },
    {
      id: "anthropic",
      label: "Anthropic (OpenAI-compatible proxy / gateway)",
      needsKey: true,
      needsEndpoint: true,
      defaultEndpoint: PROVIDER_PRESETS.anthropic.baseUrl,
    },
    {
      id: "ollama",
      label: "Ollama (local, usually no key)",
      needsKey: false,
      needsEndpoint: false,
      defaultEndpoint: PROVIDER_PRESETS.ollama.baseUrl,
    },
    {
      id: "custom",
      label: "Custom OpenAI-compatible endpoint",
      needsKey: true,
      needsEndpoint: true,
      defaultEndpoint: "http://127.0.0.1:1234/v1",
    },
  ];
}

export function formatProviderMenu(): string {
  const rows = listAcceptedProviders();
  return [
    "Providers Anique accepts:",
    ...rows.map((p, i) => `  ${i + 1}) ${p.id.padEnd(12)} ${p.label}`),
    "",
    "Reply with a number to add/configure a provider.",
    "Or type: cancel",
  ].join("\n");
}

export async function loadModelsForProfile(
  profile: Pick<ProviderProfile, "provider" | "baseUrl" | "apiKey" | "model">,
): Promise<ModelInfo[]> {
  const cfg: AniqueConfig = {
    ...loadConfig(),
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model || "unknown",
  };
  return fetchProviderModels(cfg);
}
