import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { ensureAniqueHome, aniqueHome } from "../config/index.js";

export interface SessionRow {
  id: string;
  lens: string;
  workspace: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface TraceEvent {
  ts: string;
  kind: "user" | "assistant" | "tool" | "system" | "approval" | "rhythm";
  summary: string;
  detail?: string;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  ensureAniqueHome();
  const path = join(aniqueHome(), "anique.db");
  db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      lens TEXT NOT NULL,
      workspace TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      tool_name TEXT,
      tool_call_id TEXT,
      tool_calls_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      session_id UNINDEXED,
      content='messages',
      content_rowid='id'
    );
    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      lens TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      gaps TEXT,
      learned_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  // migrate older DBs missing tool_calls_json
  try {
    const cols = db
      .prepare(`PRAGMA table_info(messages)`)
      .all() as unknown as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "tool_calls_json")) {
      db.exec(`ALTER TABLE messages ADD COLUMN tool_calls_json TEXT`);
    }
  } catch {
    /* ignore */
  }
  return db;
}

/** Close DB so a profile switch can open a different anique.db. */
export function resetDb(): void {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}

export function createSession(opts: {
  lens: string;
  workspace: string;
  title: string;
}): SessionRow {
  const database = getDb();
  const id = `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  database
    .prepare(
      `INSERT INTO sessions (id, lens, workspace, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, opts.lens, opts.workspace, opts.title.slice(0, 120), now, now);
  return {
    id,
    lens: opts.lens,
    workspace: opts.workspace,
    title: opts.title.slice(0, 120),
    created_at: now,
    updated_at: now,
  };
}

export function touchSession(id: string, lens?: string): void {
  const database = getDb();
  const now = new Date().toISOString();
  if (lens) {
    database
      .prepare(`UPDATE sessions SET updated_at = ?, lens = ? WHERE id = ?`)
      .run(now, lens, id);
  } else {
    database.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, id);
  }
}

export function listSessions(limit = 20): SessionRow[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT id, lens, workspace, title, created_at, updated_at
       FROM sessions ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(limit) as unknown as SessionRow[];
}

export function getSession(id: string): SessionRow | undefined {
  const database = getDb();
  return database
    .prepare(
      `SELECT id, lens, workspace, title, created_at, updated_at FROM sessions WHERE id = ?`,
    )
    .get(id) as unknown as SessionRow | undefined;
}

export function appendMessage(opts: {
  sessionId: string;
  role: string;
  content: string | null;
  toolName?: string;
  toolCallId?: string;
  /** JSON-serialized OpenAI tool_calls array for assistant messages */
  toolCallsJson?: string | null;
}): void {
  const database = getDb();
  const now = new Date().toISOString();
  const result = database
    .prepare(
      `INSERT INTO messages (session_id, role, content, tool_name, tool_call_id, tool_calls_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.sessionId,
      opts.role,
      opts.content ?? "",
      opts.toolName ?? null,
      opts.toolCallId ?? null,
      opts.toolCallsJson ?? null,
      now,
    );
  try {
    database
      .prepare(
        `INSERT INTO messages_fts (rowid, content, session_id) VALUES (?, ?, ?)`,
      )
      .run(result.lastInsertRowid, opts.content ?? "", opts.sessionId);
  } catch {
    // FTS may fail on some builds; search still works via LIKE fallback
  }
  touchSession(opts.sessionId);
}

export function appendTrace(sessionId: string, event: TraceEvent): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO traces (session_id, ts, kind, summary, detail) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sessionId, event.ts, event.kind, event.summary, event.detail ?? null);
}

export function getTraces(sessionId: string): TraceEvent[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT ts, kind, summary, detail FROM traces WHERE session_id = ? ORDER BY id ASC`,
    )
    .all(sessionId) as unknown as TraceEvent[];
}

export interface StoredMessage {
  role: string;
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_calls_json: string | null;
  created_at: string;
}

export function getSessionMessages(sessionId: string): StoredMessage[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT role, content, tool_name, tool_call_id, tool_calls_json, created_at
       FROM messages WHERE session_id = ? ORDER BY id ASC`,
    )
    .all(sessionId) as unknown as StoredMessage[];
}

export function exportSessionMarkdown(sessionId: string): string {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const msgs = getSessionMessages(sessionId);
  const lines = [
    `# Anique session ${session.id}`,
    "",
    `- lens: ${session.lens}`,
    `- workspace: ${session.workspace}`,
    `- title: ${session.title}`,
    `- updated: ${session.updated_at}`,
    "",
    "---",
    "",
  ];
  for (const m of msgs) {
    if (m.role === "tool") {
      lines.push(`### tool ${m.tool_name ?? ""}`);
      lines.push("```");
      lines.push((m.content || "").slice(0, 4000));
      lines.push("```");
      lines.push("");
      continue;
    }
    lines.push(`### ${m.role}`);
    lines.push(m.content || "");
    lines.push("");
  }
  return lines.join("\n");
}

export function recall(query: string, limit = 20): Array<{
  session_id: string;
  content: string;
  title: string;
  lens: string;
}> {
  const database = getDb();
  const q = query.trim();
  if (!q) return [];
  try {
    const rows = database
      .prepare(
        `SELECT m.session_id as session_id, m.content as content, s.title as title, s.lens as lens
         FROM messages_fts f
         JOIN messages m ON m.id = f.rowid
         JOIN sessions s ON s.id = m.session_id
         WHERE messages_fts MATCH ?
         ORDER BY m.id DESC LIMIT ?`,
      )
      .all(q, limit) as unknown as Array<{
      session_id: string;
      content: string;
      title: string;
      lens: string;
    }>;
    if (rows.length) return rows;
  } catch {
    // fall through
  }
  return database
    .prepare(
      `SELECT m.session_id as session_id, m.content as content, s.title as title, s.lens as lens
       FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.content LIKE ?
       ORDER BY m.id DESC LIMIT ?`,
    )
    .all(`%${q}%`, limit) as unknown as Array<{
    session_id: string;
    content: string;
    title: string;
    lens: string;
  }>;
}

export interface EpisodeRow {
  id: number;
  session_id: string;
  lens: string;
  title: string;
  summary: string;
  verified: number;
  gaps: string | null;
  learned_json: string | null;
  created_at: string;
}

export function appendEpisode(opts: {
  sessionId: string;
  lens: string;
  title: string;
  summary: string;
  verified: boolean;
  gaps?: string[];
  learnedJson?: string;
}): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO episodes (session_id, lens, title, summary, verified, gaps, learned_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.sessionId,
      opts.lens,
      opts.title.slice(0, 160),
      opts.summary.slice(0, 4000),
      opts.verified ? 1 : 0,
      opts.gaps?.join("; ") ?? null,
      opts.learnedJson ?? null,
      new Date().toISOString(),
    );
}

export function listEpisodes(limit = 20): EpisodeRow[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT id, session_id, lens, title, summary, verified, gaps, learned_json, created_at
       FROM episodes ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as unknown as EpisodeRow[];
}

export function searchEpisodes(
  query: string,
  limit = 10,
): EpisodeRow[] {
  const database = getDb();
  const q = `%${query.trim()}%`;
  if (!query.trim()) return listEpisodes(limit);
  return database
    .prepare(
      `SELECT id, session_id, lens, title, summary, verified, gaps, learned_json, created_at
       FROM episodes
       WHERE title LIKE ? OR summary LIKE ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(q, q, limit) as unknown as EpisodeRow[];
}
