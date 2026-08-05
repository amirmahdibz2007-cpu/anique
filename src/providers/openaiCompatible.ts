import type { AniqueConfig } from "../config/index.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatMessage,
  StreamChunk,
  ToolCall,
} from "./types.js";

function headers(config: AniqueConfig): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.provider === "openrouter") {
    h["HTTP-Referer"] = "https://github.com/anique/anique";
    h["X-Title"] = "Anique Agent";
  }
  return h;
}

function endpoint(config: AniqueConfig): string {
  return `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
}

function assertKey(config: AniqueConfig): void {
  if (config.provider === "ollama") return;
  if (!config.apiKey?.trim() || !config.model?.trim()) {
    throw new Error(
      "Model not set. In TUI type: /models\n" +
        "Or run: anique models",
    );
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isNonRetryableProviderError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  if (msg.startsWith("Auth failed") || msg.startsWith("Payment required")) return true;
  if (msg.startsWith("Model not set")) return true;
  const m = msg.match(/Provider error (\d+)/);
  if (m) {
    const status = Number(m[1]);
    return !isRetryableStatus(status);
  }
  return false;
}

/**
 * Fetch chat completions with bounded retries for transient failures (429/502/503/504).
 * 401/402 and other 4xx fail immediately with a clear message.
 */
async function fetchWithRetry(
  config: AniqueConfig,
  body: unknown,
  opts?: { maxAttempts?: number },
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint(config), {
        method: "POST",
        headers: headers(config),
        body: JSON.stringify(body),
      });
      if (res.ok) return res;

      const text = await res.text();
      const err = new Error(formatProviderError(res.status, text));
      if (!isRetryableStatus(res.status)) throw err;
      lastErr = err;
    } catch (err) {
      if (isNonRetryableProviderError(err)) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt >= maxAttempts) break;
    await sleep(Math.min(8000, 400 * 2 ** (attempt - 1)));
  }
  throw lastErr ?? new Error("Provider request failed");
}

/** Non-streaming completion (used as fallback / tests). */
export async function chatComplete(
  config: AniqueConfig,
  req: Omit<ChatCompletionRequest, "stream">,
): Promise<ChatCompletionResult> {
  assertKey(config);
  const res = await fetchWithRetry(config, { ...req, stream: false });
  const data = (await res.json()) as {
    choices?: Array<{
      message?: ChatMessage;
      finish_reason?: string | null;
    }>;
  };
  const choice = data.choices?.[0];
  if (!choice?.message) {
    throw new Error("Provider returned an empty completion.");
  }
  return {
    message: choice.message,
    finishReason: choice.finish_reason ?? null,
  };
}

/**
 * Streaming chat completions (OpenAI-compatible SSE).
 * Retries the initial HTTP connect on 429/502/503; mid-stream failures keep partial content.
 */
export async function* chatStream(
  config: AniqueConfig,
  req: Omit<ChatCompletionRequest, "stream">,
): AsyncGenerator<StreamChunk, ChatCompletionResult> {
  assertKey(config);
  const res = await fetchWithRetry(config, { ...req, stream: true });
  if (!res.body) {
    throw new Error("Provider returned no response body for stream.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls: ToolCall[] = [];
  let finishReason: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          yield { type: "done", finishReason };
          continue;
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{
              delta?: {
                content?: string | null;
                tool_calls?: Array<{
                  index?: number;
                  id?: string;
                  type?: "function";
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>;
            error?: { message?: string };
          };
          if (json.error?.message) {
            yield { type: "error", error: json.error.message };
            throw new Error(json.error.message);
          }
          const choice = json.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice.delta;
          if (delta?.content) {
            content += delta.content;
            yield { type: "content", content: delta.content };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id ?? `call_${idx}`,
                  type: "function",
                  function: { name: tc.function?.name ?? "", arguments: "" },
                };
              } else {
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) {
                  toolCalls[idx].function.name += tc.function.name;
                }
              }
              if (tc.function?.arguments) {
                toolCalls[idx].function.arguments += tc.function.arguments;
              }
              yield {
                type: "tool_call_delta",
                toolCall: {
                  index: idx,
                  id: toolCalls[idx].id,
                  function: { ...toolCalls[idx].function },
                },
              };
            }
          }
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
  } catch (err) {
    // Mid-stream failure: return partial so callers can keep it in the feed
    if (content.trim()) {
      const message: ChatMessage = {
        role: "assistant",
        content,
      };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;
      yield {
        type: "error",
        error: `${err instanceof Error ? err.message : String(err)} · partial kept`,
      };
      return { message, finishReason: finishReason ?? "error" };
    }
    throw err;
  }

  const message: ChatMessage = {
    role: "assistant",
    content: content || null,
  };
  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  return { message, finishReason };
}

export function formatProviderError(status: number, body: string): string {
  let detail = body.slice(0, 500);
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof j.error === "string") detail = j.error;
    else if (j.error?.message) detail = j.error.message;
  } catch {
    // keep raw
  }
  if (status === 401) {
    return `Auth failed (401). Check your API key.\n${detail}`;
  }
  if (status === 402) {
    return `Payment required (402). Top up provider credits.\n${detail}`;
  }
  if (status === 429) {
    return `Rate limited (429). Wait and retry.\n${detail}`;
  }
  return `Provider error ${status}: ${detail}`;
}
