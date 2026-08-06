/**
 * WebSocket handler for Anique Web UI.
 *
 * Protocol (JSON over WS):
 *   Client → Server:  { type: "message", text: string, sessionId?: string }
 *   Client → Server:  { type: "abort" }
 *   Client → Server:  { type: "load_session", sessionId: string }
 *   Client → Server:  { type: "approval_response", id: string, decision: ApprovalDecision }
 *
 *   Server → Client:  { type: "token",            text: string }
 *   Server → Client:  { type: "event",            kind: string, summary: string, detail?: string }
 *   Server → Client:  { type: "approval_request", id: string, tool: string, prompt: string,
 *                                                  preview: string, risk: string }
 *   Server → Client:  { type: "done",             sessionId: string, usageText: string }
 *   Server → Client:  { type: "session_loaded",   sessionId: string, title: string, messages: [] }
 *   Server → Client:  { type: "error",            message: string }
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "node:http";
import { runAgent } from "../agent/loop.js";
import type { AniqueConfig } from "../config/index.js";
import type { TraceEvent } from "../store/db.js";
import { getSession, getSessionMessages } from "../store/db.js";
import type { ChatMessage } from "../providers/types.js";
import {
  setApprovalHandler,
  type ApprovalDecision,
  type ApprovalRequest,
} from "../safety/approval.js";

interface WsContext {
  config: AniqueConfig;
  lensId: string;
  workspace: string;
}

export function attachWebSocket(server: Server, ctx: WsContext): void {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    let abortController: AbortController | null = null;
    let sessionId: string | undefined;
    let history: ChatMessage[] = [];

    // Pending approval promises: id → { resolve }
    const pendingApprovals = new Map<
      string,
      (decision: ApprovalDecision) => void
    >();
    let approvalSeq = 0;

    const send = (obj: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    };

    // Register a WebSocket-based approval handler for this connection.
    // When the agent needs approval, we send a request to the browser and
    // wait for the user's response before continuing.
    const wsApprovalHandler = async (
      req: ApprovalRequest,
    ): Promise<ApprovalDecision> => {
      const id = `apr_${++approvalSeq}`;
      return new Promise<ApprovalDecision>((resolve) => {
        pendingApprovals.set(id, resolve);
        send({
          type: "approval_request",
          id,
          tool: req.tool ?? "unknown",
          prompt: req.prompt,
          preview: req.preview ?? "",
          risk: req.risk ?? "safe",
          permissionMode: req.permissionMode ?? "",
        });
      });
    };

    // Install the handler when this connection is active.
    // Note: only one WS connection is expected at a time (personal tool).
    setApprovalHandler(wsApprovalHandler);

    // Greet the client with context info
    send({
      type: "hello",
      lens: ctx.lensId,
      workspace: ctx.workspace,
    });

    ws.on("message", async (raw) => {
      let msg: {
        type: string;
        text?: string;
        sessionId?: string;
        id?: string;
        decision?: string;
      };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send({ type: "error", message: "Invalid JSON" });
        return;
      }

      // ── Approval response from browser ──────────────────────
      if (msg.type === "approval_response" && msg.id) {
        const resolve = pendingApprovals.get(msg.id);
        if (resolve) {
          pendingApprovals.delete(msg.id);
          const decision = (msg.decision ?? "deny") as ApprovalDecision;
          resolve(decision);
        }
        return;
      }

      // ── Abort ───────────────────────────────────────────────
      if (msg.type === "abort") {
        // Deny all pending approvals so the agent unblocks cleanly
        for (const [id, resolve] of pendingApprovals) {
          pendingApprovals.delete(id);
          resolve("deny");
        }
        abortController?.abort();
        return;
      }

      // ── Load past session ───────────────────────────────────
      if (msg.type === "load_session" && msg.sessionId) {
        const session = getSession(msg.sessionId);
        if (!session) {
          send({ type: "error", message: `Session not found: ${msg.sessionId}` });
          return;
        }
        const stored = getSessionMessages(msg.sessionId);
        history = stored
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content ?? "",
          }));
        sessionId = msg.sessionId;
        send({
          type: "session_loaded",
          sessionId: msg.sessionId,
          title: session.title,
          messages: stored,
        });
        return;
      }

      // ── New user message ────────────────────────────────────
      if (msg.type !== "message" || !msg.text?.trim()) {
        send({ type: "error", message: "Expected { type: 'message', text: '...' }" });
        return;
      }

      if (msg.sessionId) sessionId = msg.sessionId;

      abortController = new AbortController();

      try {
        const result = await runAgent({
          config: ctx.config,
          lensId: ctx.lensId,
          workspace: ctx.workspace,
          userMessage: msg.text,
          sessionId,
          history,
          signal: abortController.signal,
          quiet: true,
          onToken: (token) => {
            send({ type: "token", text: token });
          },
          onEvent: (event: TraceEvent) => {
            send({
              type: "event",
              kind: event.kind,
              summary: event.summary,
              detail: event.detail,
            });
          },
          onUsage: (usageText) => {
            send({ type: "usage", text: usageText });
          },
        });

        sessionId = result.sessionId;
        history = result.messages.filter(
          (m) => m.role !== "system",
        ) as ChatMessage[];

        send({
          type: "done",
          sessionId: result.sessionId,
          usageText: result.usageText,
          aborted: result.aborted,
        });
      } catch (err) {
        send({ type: "error", message: String(err) });
      }
    });

    ws.on("close", () => {
      // Deny any pending approvals so the agent doesn't hang
      for (const [id, resolve] of pendingApprovals) {
        pendingApprovals.delete(id);
        resolve("deny");
      }
      abortController?.abort();
      // Restore default (readline) approval handler
      setApprovalHandler(null);
    });
  });
}
