/**
 * Offline smoke checks (no API key required).
 * Run: npx tsx --experimental-sqlite scripts/smoke.ts
 */
import assert from "node:assert/strict";
import {
  classifyBash,
  classifyWrite,
  needsApproval,
  clearSessionAllows,
  hasSessionAllow,
  hasWorkspaceWriteAllow,
  sessionAllowKey,
  applyApprovalDecision,
  clearWorkspaceWriteAllow,
} from "../src/safety/approval.js";
import { getLens, listLensIds } from "../src/lenses/index.js";
import { getToolDefinitions } from "../src/tools/registry.js";
import { assembleSystemPrompt } from "../src/agent/prompt.js";

process.env.ANIQUE_HOME = new URL("../.anique-dev", import.meta.url).pathname;

assert.equal(classifyBash("ls -la"), "safe");
assert.equal(classifyBash("sudo systemctl restart nginx"), "dangerous");
assert.equal(classifyWrite("/tmp/x", "/home/u/proj"), "dangerous");
assert.equal(classifyWrite("/home/u/proj/a.ts", "/home/u/proj"), "workspace_write");
assert.equal(needsApproval("dangerous", "auto", "act"), true);
assert.equal(needsApproval("safe", "suggest", "act"), false);
assert.equal(needsApproval("workspace_write", "suggest", "act"), true);
assert.equal(needsApproval("workspace_write", "auto", "act"), false);
assert.equal(needsApproval("workspace_write", "allowlist", "act"), false);
assert.equal(
  needsApproval("safe", "allowlist", "act", {
    command: "git status",
    allowlist: ["git "],
  }),
  false,
);
assert.equal(
  needsApproval("safe", "allowlist", "act", {
    command: "curl evil",
    allowlist: ["git "],
  }),
  true,
);

const ids = listLensIds();
assert.deepEqual(
  ids.sort(),
  [
    "atelier",
    "bot",
    "code",
    "daily",
    "evolve",
    "market",
    "system",
    "teach",
    "write",
  ].sort(),
);

// Approval UX: once = this action only; session = remember key; unlock = everything.
for (const fn of [
  clearSessionAllows,
  clearWorkspaceWriteAllow,
]) {
  fn();
}
const k = sessionAllowKey("workspace_write", "write /tmp/proj/a.ts");
assert.equal(hasSessionAllow(k), false);
assert.equal(applyApprovalDecision("once", { sessionKey: k }), true);
assert.equal(hasSessionAllow(k), false, "once does NOT register session allow");
assert.equal(applyApprovalDecision("session", { sessionKey: k }), true);
assert.equal(hasSessionAllow(k), true, "session registers allow for same action");
clearSessionAllows();

const k2 = sessionAllowKey("workspace_write", "write /tmp/proj/b.ts");
assert.equal(hasWorkspaceWriteAllow(), false);
assert.equal(applyApprovalDecision("workspace", { sessionKey: k2 }), true);
assert.equal(hasWorkspaceWriteAllow(), true, "workspace enables session-wide workspace writes");
clearSessionAllows();
clearWorkspaceWriteAllow();

for (const id of ids) {
  const lens = getLens(id);
  assert.ok(lens.systemPrompt.length > 20, id);
  const tools = getToolDefinitions(lens.tools);
  assert.ok(tools.length >= 5, id);
  const prompt = assembleSystemPrompt({
    lens,
    workspace: process.cwd(),
    rhythm: "plan",
  });
  assert.match(prompt, /Anique/);
  assert.match(prompt, new RegExp(id));
}

console.log("smoke ok —", ids.length, "lenses, safety gates, prompts");
