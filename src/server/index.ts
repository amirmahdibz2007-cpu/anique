/**
 * Anique Web UI — personal localhost server.
 * Binds ONLY to 127.0.0.1 (never 0.0.0.0).
 * Usage: anique web [--port 7470]
 */

import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { attachWebSocket } from "./ws.js";
import type { AniqueConfig } from "../config/index.js";
import { listSessions, getSessionMessages } from "../store/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".ico": "image/x-icon",
};

export async function startWebServer(opts: {
  config: AniqueConfig;
  lensId: string;
  workspace: string;
  port?: number;
  openBrowser?: boolean;
}): Promise<void> {
  const port = opts.port ?? 7470;
  const staticDir = join(__dirname, "static");

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";

    // ── API routes ──────────────────────────────────────────────
    // GET /api/sessions — list recent sessions
    if (req.method === "GET" && url === "/api/sessions") {
      const sessions = listSessions(50);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(sessions));
      return;
    }

    // GET /api/sessions/:id/messages — load history for a session
    const msgMatch = url.match(/^\/api\/sessions\/([^/]+)\/messages$/);
    if (req.method === "GET" && msgMatch) {
      const sessionId = msgMatch[1]!;
      const messages = getSessionMessages(sessionId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(messages));
      return;
    }

    // ── Static files ────────────────────────────────────────────
    // Only serve static files — no dynamic routes needed for MVP
    let urlPath = url;
    if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

    const filePath = join(staticDir, urlPath);

    // Security: ensure we never escape the static dir
    if (!filePath.startsWith(staticDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = extname(filePath);
    const mime = MIME[ext] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(readFileSync(filePath));
  });

  // Attach WebSocket handler (agent loop lives there)
  attachWebSocket(server, {
    config: opts.config,
    lensId: opts.lensId,
    workspace: opts.workspace,
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, "127.0.0.1", () => resolve());
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `\n  ✗ Port ${port} is already in use.\n` +
          `    Kill the old process:  kill $(lsof -ti tcp:${port})\n` +
          `    Or use a different port:  anique web --port 7471\n`,
        );
        process.exit(1);
      }
      reject(err);
    });
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`\n  ◆ ANIQUE WEB  →  ${url}\n`);
  console.log(`  lens=${opts.lensId}  workspace=${opts.workspace}`);
  console.log(`  Press Ctrl+C to stop.\n`);

  if (opts.openBrowser) {
    const { exec } = await import("node:child_process");
    const cmd =
      process.platform === "darwin"
        ? `open "${url}"`
        : process.platform === "win32"
          ? `start "" "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd);
  }

  // Graceful shutdown on Ctrl+C or SIGTERM — closes server cleanly so the
  // port is released immediately and the next `anique web` never hits EADDRINUSE.
  const shutdown = () => {
    console.log("\n  ◆ ANIQUE WEB  shutting down…");
    server.closeAllConnections?.();
    server.close(() => {
      process.exit(0);
    });
    // Force-exit after 2 s if connections don't drain
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once("SIGINT",  shutdown);
  process.once("SIGTERM", shutdown);

  // Keep alive
  await new Promise<void>(() => {});
}
