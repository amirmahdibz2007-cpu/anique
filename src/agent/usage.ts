import type { ChatMessage } from "../providers/types.js";
import { chatComplete } from "../providers/openaiCompatible.js";
import type { AniqueConfig } from "../config/index.js";

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  steps: number;
}

/** Rough $/1M tokens — good enough for /cost UX (not billing-grade). */
const RATE: Record<string, { in: number; out: number }> = {
  default: { in: 3, out: 15 },
  "claude-sonnet": { in: 3, out: 15 },
  "claude-opus": { in: 15, out: 75 },
  "claude-haiku": { in: 0.8, out: 4 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1": { in: 2, out: 8 },
  llama: { in: 0, out: 0 },
  local: { in: 0, out: 0 },
};

export function estimateTokensFromText(text: string): number {
  // ~4 chars/token heuristic
  return Math.ceil((text || "").length / 4);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let n = 0;
  for (const m of messages) {
    n += estimateTokensFromText(m.content ?? "");
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        n += estimateTokensFromText(tc.function.name);
        n += estimateTokensFromText(tc.function.arguments);
      }
    }
  }
  return n;
}

function rateForModel(model: string): { in: number; out: number } {
  const m = model.toLowerCase();
  for (const [key, rate] of Object.entries(RATE)) {
    if (key !== "default" && m.includes(key)) return rate;
  }
  if (m.includes("ollama") || m.includes("llama") || m.includes("local")) {
    return RATE.local!;
  }
  return RATE.default!;
}

export function createUsageTracker(model: string): {
  add: (input: number, output: number) => void;
  addText: (inText: string, outText: string) => void;
  snapshot: () => UsageStats;
  format: () => string;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let steps = 0;
  const rate = rateForModel(model);

  return {
    add(input, output) {
      inputTokens += input;
      outputTokens += output;
      steps += 1;
    },
    addText(inText, outText) {
      this.add(estimateTokensFromText(inText), estimateTokensFromText(outText));
    },
    snapshot() {
      const estimatedUsd =
        (inputTokens * rate.in + outputTokens * rate.out) / 1_000_000;
      return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedUsd,
        steps,
      };
    },
    format() {
      const s = this.snapshot();
      return [
        `tokens  in≈${s.inputTokens.toLocaleString()}  out≈${s.outputTokens.toLocaleString()}  total≈${s.totalTokens.toLocaleString()}`,
        `est. $  ~$${s.estimatedUsd.toFixed(4)}  (${model})`,
        `steps   ${s.steps}`,
        `(heuristic — not provider billing)`,
      ].join("\n");
    },
  };
}

/** Model-aware context window estimates for /context chrome. */
export function contextLimitForModel(model: string): number {
  const m = model.toLowerCase();
  if (m.includes("gemini") && m.includes("pro")) return 1_000_000;
  if (m.includes("claude") && (m.includes("sonnet") || m.includes("opus")))
    return 200_000;
  if (m.includes("gpt-4.1") || m.includes("o3") || m.includes("o4"))
    return 200_000;
  if (m.includes("gpt-4o")) return 128_000;
  if (m.includes("mini") || m.includes("haiku")) return 128_000;
  if (m.includes("llama") || m.includes("qwen")) return 32_768;
  return 128_000;
}

export function formatContextBar(
  messages: ChatMessage[],
  contextLimitOrModel: number | string = 128_000,
): string {
  const contextLimit =
    typeof contextLimitOrModel === "string"
      ? contextLimitForModel(contextLimitOrModel)
      : contextLimitOrModel;
  const used = estimateMessagesTokens(messages);
  const pct = Math.min(100, Math.round((used / contextLimit) * 100));
  const width = 24;
  const filled = Math.round((pct / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `context  [${bar}] ${pct}%  ≈${used.toLocaleString()} / ${contextLimit.toLocaleString()} tok`;
}

export function contextPct(
  messages: ChatMessage[],
  model: string,
): { used: number; limit: number; pct: number } {
  const limit = contextLimitForModel(model);
  const used = estimateMessagesTokens(messages);
  return {
    used,
    limit,
    pct: Math.min(100, Math.round((used / limit) * 100)),
  };
}

/** Compress history into a summary + last N messages (Claude/OpenCode-style). */
export async function compactHistory(
  config: AniqueConfig,
  messages: ChatMessage[],
  keepTail = 6,
): Promise<{ messages: ChatMessage[]; compacted: number; ok: boolean; error?: string }> {
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length <= keepTail + 2) {
    return { messages, compacted: 0, ok: true };
  }

  const head = nonSystem.slice(0, -keepTail);
  const tail = nonSystem.slice(-keepTail);
  const digest = head
    .map((m) => `${m.role}: ${(m.content ?? "").slice(0, 500)}`)
    .join("\n")
    .slice(0, 24_000);

  let summary: string;
  try {
    const result = await chatComplete(config, {
      model: config.model,
      messages: [
        {
          role: "system",
          content:
            "Summarize this agent conversation for continuity. Keep goals, decisions, file paths, and open TODOs. Max 400 words.",
        },
        { role: "user", content: digest },
      ],
      temperature: 0.2,
    });
    summary = (result.message.content ?? "").trim();
    if (!summary) {
      // Hermes lesson: never drop history on empty summary
      return {
        messages,
        compacted: 0,
        ok: false,
        error: "summary empty — history unchanged",
      };
    }
  } catch (err) {
    return {
      messages,
      compacted: 0,
      ok: false,
      error: `compact aborted: ${String(err)}`,
    };
  }

  const system = messages.find((m) => m.role === "system");
  const out: ChatMessage[] = [];
  if (system) out.push(system);
  out.push({
    role: "user",
    content: `[compacted history — ${head.length} messages]\n${summary}`,
  });
  out.push({
    role: "assistant",
    content: "Understood — continuing from the compacted context.",
  });
  out.push(...tail);
  return { messages: out, compacted: head.length, ok: true };
}
