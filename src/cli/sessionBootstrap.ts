import type { ChatMessage } from "../providers/types.js";
import {
  getSession,
  getSessionMessages,
  type SessionRow,
  type StoredMessage,
} from "../store/db.js";

export interface SessionHydration {
  session: SessionRow;
  history: ChatMessage[];
  lastAssistant: string;
  lastUserPrompt: string;
}

/** Convert stored DB messages into LLM history (shared by TUI + classic). */
export function messagesToHistory(sessionId: string): {
  history: ChatMessage[];
  lastAssistant: string;
  lastUserPrompt: string;
} {
  const rows = getSessionMessages(sessionId);
  const history: ChatMessage[] = [];
  let lastAssistant = "";
  let lastUserPrompt = "";

  for (const m of rows) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      history.push({ role: "user", content: m.content ?? "" });
      lastUserPrompt = m.content ?? "";
    } else if (m.role === "assistant") {
      const msg: ChatMessage = {
        role: "assistant",
        content: m.content,
      };
      if (m.tool_calls_json) {
        try {
          msg.tool_calls = JSON.parse(m.tool_calls_json);
        } catch {
          /* ignore */
        }
      }
      history.push(msg);
      if (m.content) lastAssistant = m.content;
    } else if (m.role === "tool") {
      history.push({
        role: "tool",
        content: m.content ?? "",
        tool_call_id: m.tool_call_id ?? undefined,
        name: m.tool_name ?? undefined,
      });
    }
  }
  return { history, lastAssistant, lastUserPrompt };
}

/**
 * Resume a session with hydrated history for classic REPL / shared callers.
 * Returns null if the session id is unknown.
 */
export function bootstrapSession(sessionId: string): SessionHydration | null {
  const session = getSession(sessionId);
  if (!session) return null;
  const { history, lastAssistant, lastUserPrompt } = messagesToHistory(sessionId);
  return { session, history, lastAssistant, lastUserPrompt };
}

export function summarizeStored(rows: StoredMessage[]): string {
  return `${rows.length} messages`;
}
