// Sudo handling: a privileged command needing a password is queued, not fatal,
// and the agent can keep going. pendingSudoCommands() exposes the list.
import {
  runTool,
  type ToolContext,
  pendingSudoCommands,
  clearPendingSudo,
} from "../src/tools/registry.js";
import { unlockSession } from "../src/safety/approval.js";

clearPendingSudo();
unlockSession(); // skip approval so we reach the sudo logic itself

const ctx: ToolContext = {
  workspace: "/tmp/anique-sudo",
  lens: "code",
  approvalMode: "auto",
  rhythm: "act",
  onApproval: () => {},
};
const { mkdirSync } = await import("node:fs");
mkdirSync("/tmp/anique-sudo", { recursive: true });

const r = await runTool("bash", JSON.stringify({ command: "sudo -n true 2>&1 || sudo true" }), ctx);
console.log("sudo-sensitive run ok:", r.ok);
console.log("output:", r.output.slice(0, 200));

const pending = pendingSudoCommands();
console.log("pending sudo count:", pending.length);

// A normal write must STILL work after a sudo attempt (agent keeps going).
const w = await runTool("write_file", JSON.stringify({ path: "note.txt", content: "hi" }), ctx);
console.log("write after sudo ok:", w.ok);

const ok = w.ok;
console.log(ok ? "SUDO-QUEUE OK" : "SUDO-QUEUE FAIL");
process.exit(ok ? 0 : 1);
