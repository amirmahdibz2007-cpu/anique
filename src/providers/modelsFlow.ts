import {
  formatProviderMenu,
  getActiveProfile,
  isModelReady,
  listAcceptedProviders,
  loadModelsForProfile,
  loadProfiles,
  upsertProfile,
  type ProviderProfile,
} from "./profiles.js";
import type { ProviderId } from "../config/index.js";
import type { ModelInfo } from "./models.js";
import { resolveModelId } from "./models.js";

type Phase =
  | "idle"
  | "pick_provider"
  | "ask_endpoint"
  | "ask_key"
  | "pick_model"
  | "pick_model_or_provider";

/**
 * Interactive /models flow for TUI (and classic REPL).
 * Step machine: provider → endpoint? → api key → model list.
 * When already configured: show API models + option to add another provider.
 */
export class ModelsFlow {
  phase: Phase = "idle";
  private draft: Partial<ProviderProfile> = {};
  private modelChoices: ModelInfo[] = [];

  get active(): boolean {
    return this.phase !== "idle";
  }

  cancel(): string {
    this.phase = "idle";
    this.draft = {};
    this.modelChoices = [];
    return "Cancelled /models.";
  }

  /** Start or reopen /models */
  async start(opts?: { forceAddProvider?: boolean }): Promise<string> {
    if (!opts?.forceAddProvider && isModelReady()) {
      return this.showConfiguredMenu();
    }
    this.phase = "pick_provider";
    this.draft = {};
    return [
      opts?.forceAddProvider
        ? "Add another provider:"
        : "Model is not set yet.",
      "",
      formatProviderMenu(),
    ].join("\n");
  }

  private async showConfiguredMenu(): Promise<string> {
    const active = getActiveProfile();
    const store = loadProfiles();
    const cfgProfile =
      active ??
      (store.profiles[0]
        ? store.profiles[0]
        : null);

    if (!cfgProfile && !isModelReady()) {
      this.phase = "pick_provider";
      return ["Model is not set yet.", "", formatProviderMenu()].join("\n");
    }

    // Use active profile or synthesize from config via getActiveProfile migration
    const profile: ProviderProfile =
      cfgProfile ??
      ({
        id: "active",
        name: "active",
        provider: "openrouter",
        baseUrl: "",
        apiKey: "",
        model: "",
        createdAt: "",
      } as ProviderProfile);

    // Prefer live active
    const live = getActiveProfile();
    const use = live ?? profile;

    this.phase = "pick_model_or_provider";
    this.draft = { ...use };
    pushStatusFetching();
    let models: ModelInfo[] = [];
    try {
      models = await loadModelsForProfile(use);
    } catch (err) {
      return `Could not list models: ${String(err)}\nTry: +  (add provider)`;
    }
    this.modelChoices = models;

    const lines = [
      `Active provider: ${use.name || use.provider}`,
      `Endpoint: ${use.baseUrl}`,
      `Model: ${use.model || "(not set)"}`,
      "",
      "Models from this API:",
      ...models.slice(0, 30).map((m, i) => {
        const mark = m.id === use.model ? "→" : " ";
        return `  ${mark} ${String(i + 1).padStart(2)}. ${m.id}`;
      }),
      models.length > 30 ? `  … +${models.length - 30} more` : "",
      "",
      "Reply with:",
      "  <number>     — switch to that model",
      "  <model-id>   — set model by id",
      "  +            — add / switch to another provider (new API key)",
      "  profiles     — list saved providers",
      "  cancel       — exit",
    ].filter(Boolean);

    return lines.join("\n");
  }

  async handle(input: string): Promise<{ message: string; done: boolean }> {
    const line = input.trim();
    if (!line) return { message: "Type a value, or cancel", done: false };
    if (/^(cancel|exit|quit)$/i.test(line)) {
      return { message: this.cancel(), done: true };
    }

    switch (this.phase) {
      case "pick_provider":
        return this.onPickProvider(line);
      case "ask_endpoint":
        return this.onEndpoint(line);
      case "ask_key":
        return this.onKey(line);
      case "pick_model":
      case "pick_model_or_provider":
        return this.onPickModel(line);
      default:
        return { message: this.cancel(), done: true };
    }
  }

  private onPickProvider(line: string): Promise<{ message: string; done: boolean }> {
    const providers = listAcceptedProviders();
    const n = Number(line);
    const chosen =
      providers[n - 1] ??
      providers.find((p) => p.id === line.toLowerCase());
    if (!chosen) {
      return Promise.resolve({
        message: "Invalid choice.\n" + formatProviderMenu(),
        done: false,
      });
    }

    const id = `${chosen.id}-${Date.now().toString(36)}`;
    this.draft = {
      id,
      name: chosen.id,
      provider: chosen.id === "custom" ? "custom" : (chosen.id as ProviderId),
      baseUrl: chosen.defaultEndpoint,
      apiKey: chosen.needsKey ? "" : "ollama",
      model: "",
      createdAt: new Date().toISOString(),
    };

    if (chosen.needsEndpoint) {
      this.phase = "ask_endpoint";
      return Promise.resolve({
        message: `Endpoint for ${chosen.id}\nDefault: ${chosen.defaultEndpoint}\nPaste URL or press Enter for default:`,
        done: false,
      });
    }
    if (chosen.needsKey) {
      this.phase = "ask_key";
      return Promise.resolve({
        message: `API key for ${chosen.id}:\n(paste key, then Enter)`,
        done: false,
      });
    }
    // ollama
    this.draft.apiKey = "ollama";
    return this.afterCredentials();
  }

  private onEndpoint(line: string): Promise<{ message: string; done: boolean }> {
    const url = line.trim() || this.draft.baseUrl || "http://127.0.0.1:1234/v1";
    this.draft.baseUrl = url.replace(/\/$/, "");
    const meta = listAcceptedProviders().find(
      (p) => p.id === this.draft.provider || p.id === this.draft.name,
    );
    if (meta?.needsKey !== false && this.draft.provider !== "ollama") {
      this.phase = "ask_key";
      return Promise.resolve({
        message: `API key for ${this.draft.name}:\n(paste key, then Enter — or 'none' if local)`,
        done: false,
      });
    }
    this.draft.apiKey = this.draft.apiKey || "local";
    return this.afterCredentials();
  }

  private onKey(line: string): Promise<{ message: string; done: boolean }> {
    const key = line.trim();
    if (!key) {
      return Promise.resolve({
        message: "API key required. Paste it, or type cancel.",
        done: false,
      });
    }
    this.draft.apiKey = key === "none" ? "local" : key;
    return this.afterCredentials();
  }

  private async afterCredentials(): Promise<{ message: string; done: boolean }> {
    const draft = this.draft as ProviderProfile;
    if (!draft.baseUrl || !draft.apiKey || !draft.provider || !draft.id) {
      return { message: "Incomplete provider. Restart with /models", done: true };
    }

    this.phase = "pick_model";
    let models: ModelInfo[] = [];
    try {
      models = await loadModelsForProfile(draft);
    } catch (err) {
      this.phase = "idle";
      return {
        message: `Could not fetch models from API: ${String(err)}\nCheck endpoint/key, then /models again.`,
        done: true,
      };
    }
    this.modelChoices = models;
    if (!models.length) {
      return {
        message:
          "No models returned. Type a model id manually (e.g. gpt-4.1), or cancel.",
        done: false,
      };
    }
    return {
      message: [
        `Connected to ${draft.name} (${draft.baseUrl})`,
        "",
        "Pick a model to use:",
        ...models.slice(0, 35).map((m, i) => `  ${String(i + 1).padStart(2)}. ${m.id}`),
        "",
        "Reply with a number or full model id.",
      ].join("\n"),
      done: false,
    };
  }

  private async onPickModel(
    line: string,
  ): Promise<{ message: string; done: boolean }> {
    if (line === "+" || /^provider|add|new$/i.test(line)) {
      this.phase = "pick_provider";
      this.draft = {};
      return {
        message: ["Add another provider:", "", formatProviderMenu()].join("\n"),
        done: false,
      };
    }
    if (/^profiles$/i.test(line)) {
      const store = loadProfiles();
      if (!store.profiles.length) {
        return { message: "No saved profiles yet.", done: false };
      }
      return {
        message: [
          "Saved providers:",
          ...store.profiles.map(
            (p) =>
              `  ${p.id === store.activeId ? "→" : " "} ${p.name} · ${p.model || "(no model)"} · ${p.baseUrl}`,
          ),
          "",
          "Type a profile id to activate, or + to add new.",
        ].join("\n"),
        done: false,
      };
    }

    // activate existing profile by id
    const store = loadProfiles();
    const existing = store.profiles.find((p) => p.id === line || p.name === line);
    if (existing && this.phase === "pick_model_or_provider") {
      upsertProfile(existing, true);
      this.phase = "idle";
      return {
        message: `Switched provider → ${existing.name} · model ${existing.model}`,
        done: true,
      };
    }

    let modelId = line;
    const n = Number(line);
    if (n >= 1 && n <= this.modelChoices.length) {
      modelId = this.modelChoices[n - 1]!.id;
    } else {
      modelId = resolveModelId(line);
    }

    const draft = this.draft as ProviderProfile;
    draft.model = modelId;
    draft.createdAt = draft.createdAt || new Date().toISOString();
    upsertProfile(
      {
        id: draft.id!,
        name: draft.name || draft.provider!,
        provider: draft.provider!,
        baseUrl: draft.baseUrl!,
        apiKey: draft.apiKey!,
        model: modelId,
        createdAt: draft.createdAt,
      },
      true,
    );
    this.phase = "idle";
    return {
      message: `✓ Ready.\n  provider: ${draft.name}\n  model:    ${modelId}\n\nYou can chat now. /models anytime to switch model or add another API.`,
      done: true,
    };
  }
}

function pushStatusFetching(): void {
  // placeholder for future UI spinner hook
}
