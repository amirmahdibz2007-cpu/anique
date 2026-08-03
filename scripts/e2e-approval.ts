// End-to-end check: after one workspace write approval, the same file write
// and a DIFFERENT workspace write are not re-asked within a session.
import { runTool, type ToolContext } from "../src/tools/registry.js";
import {
  setApprovalHandler,
  type ApprovalDecision,
} from "../src/safety/approval.js";

const ws = "/tmp/anique-e2e";
const { mkdirSync } = await import("node:fs");
mkdirSync(ws, { recursive: true });

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

// First write of file A asks once -> approved
const a1 = await runTool(
  "write_file",
  JSON.stringify({ path: "a.ts", content: "let a = 1;\n" }),
  ctx,
);
console.log("write A (first):", a1.ok, a1.output, "asks so far:", asked);

// Rewrite same file A -> should NOT ask (same description session allow)
const a2 = await runTool(
  "write_file",
  JSON.stringify({ path: "a.ts", content: "let a = 2;\n" }),
  ctx,
);
console.log("write A (again):", a2.ok, "asks so far:", asked);

// Different file B -> with "once", it WOULD ask again (different key)
const b1 = await runTool(
  "write_file",
  JSON.stringify({ path: "b.ts", content: "let b = 1;\n" }),
  ctx,
);
console.log("write B (new file, once):", b1.ok, "asks so far:", asked);

setApprovalHandler(null);

const ok = a1.ok && a2.ok && b1.ok;

// Now verify the "workspace" (Space) decision allows all workspace writes.
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
const c1 = await runTool("write_file", JSON.stringify({ path: "x.ts", content: "x" }), ctx2);
const c2 = await runTool("write_file", JSON.stringify({ path: "y.ts", content: "y" }), ctx2);
const c3 = await runTool("apply_patch", JSON.stringify({ path: "x.ts", old_text: "x", new_text: "xx" }), ctx2);
setApprovalHandler(null);
console.log("workspace mode — asks total:", wsAsked, "(expect 1)");
const ok2 = c1.ok && c2.ok && c3.ok && wsAsked === 1;
console.log(ok2 ? "E2E workspace OK" : "E2E workspace FAIL");
process.exit(ok && ok2 ? 0 : 1);
