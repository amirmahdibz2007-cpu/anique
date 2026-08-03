// Live check: web_search performs a real DuckDuckGo search.
// We grant consent first, then confirm only ONE ask happens across calls.
import { runTool, type ToolContext } from "../src/tools/registry.js";
import {
  setWebSearchConsent,
  webSearchAsked,
  webSearchAllowed,
  askWebSearchPermission,
  setApprovalHandler,
  clearWebSearchConsent,
} from "../src/safety/approval.js";

// --- once-per-session consent check ---
clearWebSearchConsent();
let handlerCalls = 0;
setApprovalHandler(async () => {
  handlerCalls += 1;
  return "once" as const;
});
const first = await askWebSearchPermission("allow web?");
const second = await askWebSearchPermission("allow web again?");
const third = await askWebSearchPermission("allow web third?");
setApprovalHandler(null);
console.log("consent 1st:", first, "handler calls:", handlerCalls, "(expect 1)");
// First ask -> allowed; the two later calls must NOT prompt the user again.
const onceOk = first && second && third && handlerCalls === 1;
console.log(onceOk ? "ONCE-ASK OK" : "ONCE-ASK FAIL");

const ctx: ToolContext = {
  workspace: "/tmp/anique-ws",
  lens: "code",
  approvalMode: "auto",
  rhythm: "act",
  onApproval: () => {},
};

// Simulate the user consenting once.
setWebSearchConsent(true);
console.log("consent:", webSearchAsked(), webSearchAllowed());

const r1 = await runTool(
  "web_search",
  JSON.stringify({ query: "Hermes Agent Nous Research documentation", max_results: 4 }),
  ctx,
);
console.log("search 1 ok:", r1.ok);

const r2 = await runTool(
  "web_search",
  JSON.stringify({ query: "best CLI agent frameworks 2026", max_results: 3 }),
  ctx,
);
console.log("search 2 ok:", r2.ok, "(no re-ask needed)");

process.exit(r1.ok && r2.ok && onceOk ? 0 : 1);
