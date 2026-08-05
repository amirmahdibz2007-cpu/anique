/**
 * Focused regressions for Anique Daily Upgrade (Waves 1–4).
 * Run: npx tsx --experimental-sqlite scripts/regress-daily.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.ANIQUE_HOME = join(tmpdir(), `anique-regress-${Date.now()}`);
mkdirSync(process.env.ANIQUE_HOME, { recursive: true });

const {
  applyApprovalDecision,
  clearSessionAllows,
  hasSessionAllow,
  isSessionUnlocked,
  lockSession,
  sessionAllowKey,
} = await import("../src/safety/approval.js");

const { formatProviderError, isRetryableStatus } = await import(
  "../src/providers/openaiCompatible.js"
);
const { buildContextPack, isProjectMapStale } = await import(
  "../src/agent/contextPack.js"
);
const { detectVerifyCommand } = await import("../src/agent/postEditVerify.js");
const {
  dispatchSharedSlash,
  SHARED_SLASH_COMMANDS,
  parseSlash,
} = await import("../src/cli/slashCommands.js");
const { bootstrapSession, messagesToHistory } = await import(
  "../src/cli/sessionBootstrap.js"
);
const { resolveRuntimeConfig } = await import("../src/config/runtime.js");
const { getLens } = await import("../src/lenses/index.js");
const { createSession, appendMessage, resetDb, listSessions } = await import(
  "../src/store/db.js"
);
const { loadConfig, saveConfig } = await import("../src/config/index.js");
const {
  createNamedProject,
  findProjectForPath,
  bindPathToProject,
  renameNamedProject,
  unbindPath,
  listNamedProjects,
} = await import("../src/learn/namedProjects.js");
const { appendProjectMemory, readProjectMemory, projectStoreDir } =
  await import("../src/learn/projectMemory.js");

// --- Approval defaults: Enter/once safe; unlock explicit ---
clearSessionAllows();
lockSession();
const sk = sessionAllowKey("bash", "rm -rf /");
assert.equal(applyApprovalDecision("once", { sessionKey: sk }), true);
assert.equal(hasSessionAllow(sk), false);
assert.equal(isSessionUnlocked(), false);
assert.equal(applyApprovalDecision("unlock", { sessionKey: sk }), true);
assert.equal(isSessionUnlocked(), true);
lockSession();
clearSessionAllows();

// --- Provider retry helpers ---
assert.equal(isRetryableStatus(429), true);
assert.equal(isRetryableStatus(503), true);
assert.equal(isRetryableStatus(401), false);
assert.match(
  formatProviderError(401, '{"error":{"message":"bad key"}}'),
  /Auth failed/,
);

// --- Context pack ---
const ws = join(process.env.ANIQUE_HOME!, "proj");
mkdirSync(ws, { recursive: true });
writeFileSync(
  join(ws, "package.json"),
  JSON.stringify({
    name: "t",
    scripts: { typecheck: "tsc -p .", test: "node -e 0" },
  }),
);
writeFileSync(join(ws, "ANIQUE.md"), "# DNA\nhello anique\n");
assert.equal(isProjectMapStale(ws), true);
const pack = buildContextPack(ws);
assert.match(pack, /Scripts|typecheck|Project/i);
assert.equal(detectVerifyCommand(ws), "npm run typecheck");

// --- Code lens has project_ingest ---
const code = getLens("code");
assert.ok(code.tools.includes("project_ingest"));

// --- Session bootstrap hydrate ---
resetDb();
const ses = createSession({
  lens: "code",
  workspace: ws,
  title: "regress",
});
appendMessage({ sessionId: ses.id, role: "user", content: "hello world" });
appendMessage({
  sessionId: ses.id,
  role: "assistant",
  content: "hi there",
});
const boot = bootstrapSession(ses.id);
assert.ok(boot);
assert.equal(boot!.history.length, 2);
assert.equal(boot!.lastAssistant, "hi there");
assert.equal(boot!.lastUserPrompt, "hello world");
const hist = messagesToHistory(ses.id);
assert.equal(hist.history[0]?.role, "user");

// --- Shared slash parity ---
assert.ok((SHARED_SLASH_COMMANDS as readonly string[]).includes("fa"));
assert.equal(parseSlash("/Fa reply").cmd, "fa");
const fa = await dispatchSharedSlash("/fa", {
  host: "classic",
  lens: "code",
  workspace: ws,
  rhythm: "act",
});
assert.equal(fa.kind, "ok");
assert.equal(loadConfig().locale, "fa");

const bootCmd = await dispatchSharedSlash("/boot picker", {
  host: "tui",
  lens: "code",
  workspace: ws,
  rhythm: "act",
});
assert.equal(bootCmd.kind, "ok");
assert.equal(loadConfig().boot, "picker");

const redo = await dispatchSharedSlash("/redo", {
  host: "tui",
  lens: "code",
  workspace: ws,
  rhythm: "act",
  lastUserPrompt: "fix the bug",
});
assert.equal(redo.kind, "ok");
assert.ok(
  redo.kind === "ok" && redo.lines.some((l) => l.includes("__REDO_EDIT__")),
);

const redoGo = await dispatchSharedSlash("/redo!", {
  host: "classic",
  lens: "code",
  workspace: ws,
  rhythm: "act",
  lastUserPrompt: "fix the bug",
});
assert.equal(redoGo.kind, "mission");
assert.ok(redoGo.kind === "mission" && redoGo.redo === true);

// --- Named projects: own memory + chat history, plus default memory ---
const projRoot = join(process.env.ANIQUE_HOME!, "namedproj");
const dirA = join(projRoot, "a");
const dirB = join(projRoot, "b-subdir");
mkdirSync(dirA, { recursive: true });
mkdirSync(dirB, { recursive: true });

// Pre-existing unnamed project memory should migrate into the named store.
appendProjectMemory(dirA, "pre-existing note", "written before naming");
const preDir = projectStoreDir(dirA);

const proj = createNamedProject("Aurora \u062f\u0631\u062e\u0634\u0627\u0646", dirA, {
  migrateFromHashDir: preDir,
});
assert.ok(proj.id);
assert.deepEqual(findProjectForPath(dirA)?.id, proj.id);
assert.match(readProjectMemory(dirA), /pre-existing note/);

// A subdirectory of a bound path resolves to the same project (ancestor match).
mkdirSync(join(dirA, "nested"), { recursive: true });
assert.equal(findProjectForPath(join(dirA, "nested"))?.id, proj.id);

// Unrelated directory is not bound.
assert.equal(findProjectForPath(dirB), null);

// Binding a second directory shares the same project store — durable memory
// written from B is visible when reading from A, i.e. one shared project
// memory across bound folders (plus default USER/MEMORY, injected elsewhere).
bindPathToProject(proj.id, dirB);
appendProjectMemory(dirB, "from-b", "written from second bound dir");
assert.match(readProjectMemory(dirA), /from-b/);
assert.equal(projectStoreDir(dirA), projectStoreDir(dirB));

// Chat history grouping: sessions filed under either bound path are listed together.
resetDb();
const sesA = createSession({ lens: "code", workspace: dirA, title: "a" });
const sesB = createSession({ lens: "code", workspace: dirB, title: "b" });
const grouped = listSessions(10, [dirA, dirB]);
assert.equal(grouped.length, 2);
assert.ok(grouped.some((s: { id: string }) => s.id === sesA.id));
assert.ok(grouped.some((s: { id: string }) => s.id === sesB.id));

// Rename + unbind + collision guard.
const renamed = renameNamedProject(proj.id, "Aurora Renamed");
assert.equal(renamed.name, "Aurora Renamed");
assert.throws(() => createNamedProject("Another", dirA));
const removed = unbindPath(dirB);
assert.equal(removed?.id, proj.id);
assert.equal(findProjectForPath(dirB), null);
assert.ok(listNamedProjects().some((p: { id: string }) => p.id === proj.id));

// --- /project slash command ---
const projSlashNew = await dispatchSharedSlash(`/project new solo-${Date.now()}`, {
  host: "tui",
  lens: "code",
  workspace: dirB,
  rhythm: "act",
});
assert.equal(projSlashNew.kind, "ok");
const projSlashStatus = await dispatchSharedSlash("/project status", {
  host: "tui",
  lens: "code",
  workspace: dirB,
  rhythm: "act",
});
assert.ok(
  projSlashStatus.kind === "ok" &&
    projSlashStatus.lines.some((l) => l.includes("solo-")),
);

// --- Runtime config resolver ---
saveConfig({ model: "test/model", apiKey: "sk-test", provider: "openrouter" });
const rt = resolveRuntimeConfig();
assert.ok(rt.model);
assert.ok(["config", "profile", "ollama", "unset"].includes(rt.source));

console.log("regress-daily: ok");
try {
  rmSync(process.env.ANIQUE_HOME!, { recursive: true, force: true });
} catch {
  /* ignore */
}
