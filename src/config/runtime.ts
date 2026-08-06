/**
 * Single runtime config resolver: prefer active provider profile, keep config.json in sync.
 */
import {
  loadConfig,
  saveConfig,
  type AniqueConfig,
} from "./index.js";
import {
  getActiveProfile,
  applyProfileToConfig,
  isModelReady,
  upsertProfile,
} from "../providers/profiles.js";

export interface RuntimeConfig extends AniqueConfig {
  /** Where model/provider credentials were resolved from */
  source: "profile" | "config" | "ollama" | "unset";
}

/** Resolve effective provider settings; repair drift when profile is active. */
export function resolveRuntimeConfig(
  config = loadConfig(),
): RuntimeConfig {
  const active = getActiveProfile();
  if (active?.apiKey && active.model) {
    // Heal drift: flat config may be stale after profile switches
    const drifted =
      config.model !== active.model ||
      config.apiKey !== active.apiKey ||
      config.baseUrl !== active.baseUrl ||
      config.provider !== active.provider;
    if (drifted) {
      const healed = applyProfileToConfig(active);
      return { ...healed, source: "profile" };
    }
    return { ...config, source: "profile" };
  }
  if (config.provider === "ollama" && config.model?.trim()) {
    return { ...config, source: "ollama" };
  }
  if (config.apiKey?.trim() && config.model?.trim()) {
    return { ...config, source: "config" };
  }
  return { ...config, source: "unset" };
}

export function runtimeIsReady(config = loadConfig()): boolean {
  return isModelReady(resolveRuntimeConfig(config));
}

/** Persist model change into both config.json and the active profile (providers.json). */
export function setRuntimeModel(model: string): AniqueConfig {
  const active = getActiveProfile();
  if (active) {
    // upsertProfile writes providers.json AND syncs config.json, so the two
    // never drift apart again (drift would otherwise make resolveRuntimeConfig
    // silently revert to the old model on the very next turn).
    upsertProfile({ ...active, model }, true);
    return loadConfig();
  }
  return saveConfig({ model });
}
