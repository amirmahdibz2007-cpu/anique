// Simulate the exact TUI flow: user is prompted, presses [u] (unlock),
// then many more actions must run WITHOUT any further prompt.
import { runTool, type ToolContext } from "../src/tools/registry.js";
import { setApprovalHandler, clearSessionAllows } from "../src/safety/approval.js";

clearSessionAllows();
let prompts = 0;
let decidedAction: Awaited<ReturnType<typeof setApprovalHandler>> | null = null;

// First prompt: user chooses "unlock". Any subsequent prompt would mean FAIL.
setApprovalHandler(async () => {
  prompts += 1;
  if (prompts === 1) return "unlock";
  return "deny"; // if we ever prompt again, deny -> reveals the bug
});

const ctx: ToolContext = {
  workspace: "/tmp/anique-unlock-flow",
  lens: "code",
  approvalMode: "suggest", // the default that asks for workspace_write + dangerous
  rhythm: "act",
  onApproval: () => {},
};
const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
rmSync("/tmp/anique-unlock-flow", { recursive: true, force: true });
mkdirSync("/tmp/anique-unlock-flow", { recursive: true });
writeFileSync("/tmp/anique-unlock-flow/a.ts", "let a = 1;\n");

const steps: Array<[string, string]> = [
  ["write_file", JSON.stringify({ path: "b.ts", content: "let b = 1;\n" })], // workspace_write
  ["write_file", JSON.stringify({ path: "c.ts", content: "let c = 1;\n" })], // workspace_write
  ["apply_patch", JSON.stringify({ path: "a.ts", old_text: "let a = 1", new_text: "let a = 2" })], // workspace_write
  ["bash", JSON.stringify({ command: "rm -rf /tmp/anique-unlock-flow/deleteme" })], // dangerous
  ["bash", JSON.stringify({ command: "echo hi" })], // safe -> still runs under plan? no, act
  ["memory_write", JSON.stringify({ kind: "user", content: "test memory\n" })], // workspace_write
];

let allOk = true;
for (const [name, args] of steps) {
  const r = await runTool(name, args, ctx);
  console.log(`${name.padEnd(12)} ok=${r.ok} denied=${r.denied ?? false} ${r.output.slice(0, 60)}`);
  if (!r.ok) allOk = false;
}

setApprovalHandler(null);
console.log("\nprompts total:", prompts, "(expect 1)");
const ok = allOk && prompts === 1;
console.log(ok ? "✅ UNLOCK-FLOW OK — only 1 prompt, everything after ran freely" : "❌ FAIL");
process.exit(ok ? 0 : 1);
