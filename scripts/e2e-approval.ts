// End-to-end check for approval defaults after Daily Upgrade:
// - once = allow this action only (re-ask next time)
// - session = remember this exact action key
// - workspace = allow all workspace writes for the session
// - unlock = allow everything without further prompts
import { runTool, type ToolContext } from "../src/tools/registry.js";
import {
  setApprovalHandler,
  clearSessionAllows,
  lockSession,
  type ApprovalDecision,
} from "../src/safety/approval.js";

const ws = "/tmp/anique-e2e";
const { mkdirSync, rmSync } = await import("node:fs");
rmSync(ws, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });

clearSessionAllows();
lockSession();

let asked = 0;
let respondWith: ApprovalDecision = "once";
setApprovalHandler(async () => {
  asked += 1;
  return respondWith;
});

const ctx: ToolContext = {
  workspace: ws,
  lens: "atelier",
  approvalMode: "suggest",
  rhythm: "act",
  onApproval: () => {},
};

const a1 = await runTool(
  "write_file",
  JSON.stringify({ path: "a.ts", content: "let a = 1;\n" }),
  ctx,
);
console.log("write A (once):", a1.ok, "asks:", asked);

// Same file again with once -> asks again
const a2 = await runTool(
  "write_file",
  JSON.stringify({ path: "a.ts", content: "let a = 2;\n" }),
  ctx,
);
console.log("write A (once again):", a2.ok, "asks:", asked, "(expect 2)");

// Switch to session — next write remembers the key
respondWith = "session";
const b1 = await runTool(
  "write_file",
  JSON.stringify({ path: "b.ts", content: "let b = 1;\n" }),
  ctx,
);
const asksAfterB1 = asked;
const b2 = await runTool(
  "write_file",
  JSON.stringify({ path: "b.ts", content: "let b = 2;\n" }),
  ctx,
);
console.log(
  "write B session repeat:",
  b1.ok && b2.ok,
  "asks delta:",
  asked - asksAfterB1,
  "(expect 0)",
);

setApprovalHandler(null);
clearSessionAllows();
lockSession();

const ok = a1.ok && a2.ok && b1.ok && b2.ok && asked === 3;

// workspace decision allows all workspace writes
let wsAsked = 0;
setApprovalHandler(async () => {
  wsAsked += 1;
  return "workspace" as ApprovalDecision;
});
const ws2 = "/tmp/anique-e2e/ws2";
mkdirSync(ws2, { recursive: true });
const ctx2: ToolContext = {
  workspace: ws2,
  lens: "atelier",
  approvalMode: "suggest",
  rhythm: "act",
  onApproval: () => {},
};
const c1 = await runTool(
  "write_file",
  JSON.stringify({ path: "x.ts", content: "x" }),
  ctx2,
);
const c2 = await runTool(
  "write_file",
  JSON.stringify({ path: "y.ts", content: "y" }),
  ctx2,
);
const c3 = await runTool(
  "apply_patch",
  JSON.stringify({ path: "x.ts", old_text: "x", new_text: "xx" }),
  ctx2,
);
setApprovalHandler(null);
clearSessionAllows();
lockSession();
console.log("workspace mode — asks total:", wsAsked, "(expect 1)");
const ok2 = c1.ok && c2.ok && c3.ok && wsAsked === 1;
console.log(ok2 ? "E2E workspace OK" : "E2E workspace FAIL");

// unlock allows everything
let unlockAsked = 0;
setApprovalHandler(async () => {
  unlockAsked += 1;
  return "unlock" as ApprovalDecision;
});
const ws3 = "/tmp/anique-e2e/ws3";
mkdirSync(ws3, { recursive: true });
const ctx3: ToolContext = {
  workspace: ws3,
  lens: "atelier",
  approvalMode: "suggest",
  rhythm: "act",
  onApproval: () => {},
};
const d1 = await runTool(
  "write_file",
  JSON.stringify({ path: "z.ts", content: "z" }),
  ctx3,
);
const d2 = await runTool(
  "bash",
  JSON.stringify({ command: "rm -rf /tmp/anique-e2e-unlock-test" }),
  ctx3,
);
const d3 = await runTool(
  "write_file",
  JSON.stringify({ path: "w.ts", content: "w" }),
  ctx3,
);
const d4 = await runTool(
  "apply_patch",
  JSON.stringify({ path: "z.ts", old_text: "z", new_text: "zz" }),
  ctx3,
);
setApprovalHandler(null);
console.log("unlock mode — asks total:", unlockAsked, "(expect 1)");
const ok3 = d1.ok && d2.ok && d3.ok && d4.ok && unlockAsked === 1;
console.log(ok3 ? "E2E unlock OK" : "E2E unlock FAIL");
console.log(ok ? "E2E once/session OK" : "E2E once/session FAIL");
process.exit(ok && ok2 && ok3 ? 0 : 1);
