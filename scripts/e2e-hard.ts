// HARD test: simulate two consecutive "prompts" in one session.
// The user taps [u] on the FIRST prompt. The SECOND tool call MUST NOT ask.
import { runTool, type ToolContext } from "../src/tools/registry.js";
import { setApprovalHandler } from "../src/safety/approval.js";

let asks = 0;
setApprovalHandler(async () => {
  asks += 1;
  if (asks === 1) return "unlock";
  return "deny"; // if a 2nd ask happens, we deny → it will FAIL, proving the bug
});

const ctx: ToolContext = {
  workspace: "/tmp/anique-hard",
  lens: "code",
  approvalMode: "suggest",
  rhythm: "act",
  onApproval: () => {},
};
const { mkdirSync, rmSync } = await import("node:fs");
rmSync("/tmp/anique-hard", { recursive: true, force: true });
mkdirSync("/tmp/anique-hard", { recursive: true });

// Prompt 1 -> the user taps [u] (unlock)
const r1 = await runTool("write_file", JSON.stringify({ path: "a.ts", content: "1" }), ctx);
console.log("1st tool:", r1.ok, "asks:", asks);

// Prompt 2 (different file!) -> must NOT ask (unlock should cover it)
const r2 = await runTool("write_file", JSON.stringify({ path: "b.ts", content: "2" }), ctx);
console.log("2nd tool:", r2.ok, "asks:", asks, r2.output.slice(0, 60));

// Prompt 3: dangerous bash -> must NOT ask either
const r3 = await runTool("bash", JSON.stringify({ command: "rm -rf /tmp/anique-hard/x" }), ctx);
console.log("3rd tool (dangerous):", r3.ok, "asks:", asks, r3.output.slice(0, 60));

setApprovalHandler(null);
console.log("\nTOTAL ASKS:", asks, "(expect 1)");
const ok = r1.ok && r2.ok && r3.ok && asks === 1;
console.log(ok ? "✅ HARD-PASS — one unlock covers every later prompt" : "❌ HARD-FAIL — something re-asks");
process.exit(ok ? 0 : 1);
