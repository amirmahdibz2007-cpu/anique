// Simulate the exact TUI flow: user is prompted, presses [u] (unlock),
// then many more actions must run WITHOUT any further prompt.
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const home = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  ".anique-dev-unlock",
);
const ws = join(home, "ws");
process.env.ANIQUE_HOME = home;
rmSync(home, { recursive: true, force: true });
mkdirSync(ws, { recursive: true });

const { runTool } = await import("../src/tools/registry.js");
import type { ToolContext } from "../src/tools/registry.js";
const { setApprovalHandler, clearSessionAllows } = await import(
  "../src/safety/approval.js"
);

clearSessionAllows();
let prompts = 0;

// First prompt: user chooses "unlock". Any subsequent prompt would mean FAIL.
setApprovalHandler(async () => {
  prompts += 1;
  if (prompts === 1) return "unlock";
  return "deny"; // if we ever prompt again, deny -> reveals the bug
});

const ctx: ToolContext = {
  workspace: ws,
  lens: "code",
  approvalMode: "suggest",
  rhythm: "act",
  onApproval: () => {},
};
writeFileSync(join(ws, "a.ts"), "let a = 1;\n");

const steps: Array<[string, string]> = [
  ["write_file", JSON.stringify({ path: "b.ts", content: "let b = 1;\n" })],
  ["write_file", JSON.stringify({ path: "c.ts", content: "let c = 1;\n" })],
  [
    "apply_patch",
    JSON.stringify({
      path: "a.ts",
      old_text: "let a = 1",
      new_text: "let a = 2",
    }),
  ],
  ["bash", JSON.stringify({ command: `rm -rf ${join(ws, "deleteme")}` })],
  ["bash", JSON.stringify({ command: "echo hi" })],
  ["memory_write", JSON.stringify({ kind: "user", content: "test memory\n" })],
];

let allOk = true;
for (const [name, args] of steps) {
  const r = await runTool(name, args, ctx);
  console.log(
    `${name.padEnd(12)} ok=${r.ok} denied=${r.denied ?? false} ${r.output.slice(0, 60)}`,
  );
  if (!r.ok) allOk = false;
}

setApprovalHandler(null);
console.log("\nprompts total:", prompts, "(expect 1)");
const ok = allOk && prompts === 1;
console.log(
  ok
    ? "✅ UNLOCK-FLOW OK — only 1 prompt, everything after ran freely"
    : "❌ FAIL",
);
try {
  rmSync(home, { recursive: true, force: true });
} catch {
  /* ignore */
}
process.exit(ok ? 0 : 1);
