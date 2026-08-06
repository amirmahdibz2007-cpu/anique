import chalk from "chalk";
import { getLens } from "../lenses/index.js";
import { chatStream } from "../providers/openaiCompatible.js";
import type { ChatMessage } from "../providers/types.js";
import { getToolDefinitions, runTool, type ToolContext } from "../tools/registry.js";
import { assembleSystemPrompt } from "./prompt.js";
import { MissionTheater } from "../theater/missionTheater.js";
import type { TraceEvent } from "../store/db.js";
import {
  appendMessage,
  appendTrace,
  createSession,
  touchSession,
} from "../store/db.js";
import { createUsageTracker, contextPct, compactHistory } from "./usage.js";
import { snapshotWorkspace } from "./undo.js";
import {
  type DeepMode,
  markTodo,
  parseDeepFlags,
  prepareDeepPlan,
  repairUserMessage,
  synthesizeDeepResult,
  taskUserMessage,
  verifyDeepDone,
  type DeepPlan,
} from "./deep.js";
import type { AniqueConfig } from "../config/index.js";
import { runLearningPass } from "../learn/runLearning.js";
import { setLastEvidencePack } from "../learn/lastMission.js";
import type { EvidencePack } from "../learn/evidence.js";
import {
  isMetaNarration,
  userFacingAnswer,
  RETRY_DIRECT_ANSWER,
} from "./answerSanitize.js";
import { runPostEditVerify } from "./postEditVerify.js";

export type Rhythm = "plan" | "act";

const READ_ONLY_TOOLS = new Set([
  "read_file",
  "grep",
  "glob",
  "git_status",
  "git_diff",
  "memory_read",
  "recall",
  "todo_list",
  "skill_load",
]);

const EDIT_TOOLS = new Set(["write_file", "apply_patch"]);

export interface AgentRunOptions {
  config: AniqueConfig;
  lensId: string;
  workspace: string;
  userMessage: string;
  rhythm?: Rhythm;
  sessionId?: string;
  history?: ChatMessage[];
  onToken?: (token: string) => void;
  onEvent?: (event: TraceEvent) => void;
  quiet?: boolean;
  signal?: AbortSignal;
  onUsage?: (text: string) => void;
  /** auto = triage; force = /deep; off = /fast or nested task */
  deepMode?: DeepMode;
  onDeepStatus?: (msg: string) => void;
  /** Skip evidence-gated learning (nested deep tasks) */
  skipLearning?: boolean;
  /** Force learning even if config.learning=off or weak evidence */
  forceLearning?: boolean;
}

export interface AgentRunResult {
  sessionId: string;
  finalText: string;
  steps: number;
  messages: ChatMessage[];
  toolCallCount: number;
  /** Count of tools that returned ok:true (honest evidence). */
  toolOkCount: number;
  usageText: string;
  aborted: boolean;
  deepVerifyOk?: boolean | null;
}

async function maybeLearn(
  opts: AgentRunOptions,
  result: AgentRunResult,
  userMessage: string,
): Promise<void> {
  if (opts.skipLearning) return;
  if (opts.config.leanMode) return;
  const pack: EvidencePack = {
    sessionId: result.sessionId,
    lens: opts.lensId,
    userMessage,
    finalText: result.finalText,
    toolCallCount: result.toolCallCount,
    toolOkCount: result.toolOkCount,
    steps: result.steps,
    aborted: result.aborted,
    deepVerifyOk: result.deepVerifyOk ?? null,
    summary: result.finalText.slice(0, 400),
  };
  setLastEvidencePack(pack);
  try {
    await runLearningPass({
      config: opts.config,
      pack,
      force: opts.forceLearning,
      onStatus: opts.onDeepStatus,
      onEvent: opts.onEvent,
    });
  } catch (err) {
    opts.onEvent?.({
      ts: new Date().toISOString(),
      kind: "system",
      summary: `learning error · ${String(err).slice(0, 120)}`,
    });
  }
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const flagged = parseDeepFlags(opts.userMessage);
  const deepMode: DeepMode = opts.deepMode ?? flagged.mode;
  const userMessage =
    opts.deepMode != null ? opts.userMessage : flagged.prompt || opts.userMessage;

  if (deepMode !== "off") {
    const prep = await prepareDeepPlan({
      config: opts.config,
      prompt: userMessage,
      mode: deepMode,
      workspace: opts.workspace,
      onStatus: opts.onDeepStatus,
    });

    if (prep.kind === "cancel") {
      const session =
        opts.sessionId
          ? { id: opts.sessionId }
          : createSession({
              lens: opts.lensId,
              workspace: opts.workspace,
              title: userMessage,
            });
      const msg = "Deep run cancelled — no changes from the plan gate.";
      appendMessage({ sessionId: session.id, role: "assistant", content: msg });
      opts.onEvent?.({
        ts: new Date().toISOString(),
        kind: "system",
        summary: "deep cancelled",
      });
      return {
        sessionId: session.id,
        finalText: msg,
        steps: 0,
        messages: [
          ...(opts.history ?? []),
          { role: "user", content: userMessage },
          { role: "assistant", content: msg },
        ],
        toolCallCount: 0,
        toolOkCount: 0,
        usageText: "",
        aborted: true,
      };
    }

    if (prep.kind === "plan") {
      const result = await runDeepSequence(
        { ...opts, userMessage, deepMode: "off", skipLearning: true },
        prep.plan,
        prep.clarifications,
      );
      await maybeLearn(opts, result, userMessage);
      return result;
    }
  }

  const result = await runAgentPass({
    ...opts,
    userMessage,
    deepMode: "off",
    skipLearning: true,
  });
  await maybeLearn(opts, result, userMessage);
  return result;
}

async function runDeepSequence(
  opts: AgentRunOptions,
  plan: DeepPlan,
  clarifications: string,
): Promise<AgentRunResult> {
  const session =
    opts.sessionId
      ? { id: opts.sessionId }
      : createSession({
          lens: opts.lensId,
          workspace: opts.workspace,
          title: plan.goal.slice(0, 120),
        });

  const push = (summary: string, detail?: string) => {
    const ev: TraceEvent = {
      ts: new Date().toISOString(),
      kind: "system",
      summary,
      detail,
    };
    appendTrace(session.id, ev);
    opts.onEvent?.(ev);
  };

  push("deep plan approved", plan.goal);
  appendMessage({
    sessionId: session.id,
    role: "user",
    content: opts.userMessage,
  });

  let history: ChatMessage[] = [...(opts.history ?? [])].filter(
    (m) => m.role !== "system",
  );
  let totalSteps = 0;
  let totalTools = 0;
  let totalOk = 0;
  let aborted = false;
  let deepVerifyOk: boolean | null = null;
  const summaries: string[] = [];
  let usageParts: string[] = [];

  for (let i = 0; i < plan.tasks.length; i++) {
    if (opts.signal?.aborted) {
      aborted = true;
      break;
    }
    const task = plan.tasks[i]!;
    markTodo(task.id, "in_progress");
    opts.onDeepStatus?.(
      `deep · task ${i + 1}/${plan.tasks.length} · ${task.title.slice(0, 40)}`,
    );
    push(`deep task ${i + 1}/${plan.tasks.length}`, task.title);

    const taskPrompt = taskUserMessage(
      plan,
      task,
      i,
      plan.tasks.length,
      clarifications,
    );

    const result = await runAgentPass({
      ...opts,
      sessionId: session.id,
      userMessage: taskPrompt,
      history,
      deepMode: "off",
      skipLearning: true,
    });

    totalSteps += result.steps;
    totalTools += result.toolCallCount;
    totalOk += result.toolOkCount;
    usageParts.push(result.usageText);
    history = result.messages.filter((m) => m.role !== "system");
    summaries.push(`### ${task.title}\n${result.finalText || "(no text)"}`);
    markTodo(task.id, result.aborted ? "cancelled" : "completed");

    if (result.aborted) {
      aborted = true;
      break;
    }
  }

  if (!aborted) {
    opts.onDeepStatus?.("deep · verifying");
    let verdict = await verifyDeepDone(opts.config, plan, summaries);
    deepVerifyOk = verdict.ok && (!verdict.gaps || verdict.gaps.length === 0);
    if (!verdict.ok) {
      deepVerifyOk = false;
      push("deep verify gaps", verdict.gaps.join("; "));
      opts.onDeepStatus?.("deep · repair pass");
      const repair = await runAgentPass({
        ...opts,
        sessionId: session.id,
        userMessage: repairUserMessage(plan, verdict.gaps, verdict.repairHint),
        history,
        deepMode: "off",
        skipLearning: true,
      });
      totalSteps += repair.steps;
      totalTools += repair.toolCallCount;
      totalOk += repair.toolOkCount;
      history = repair.messages.filter((m) => m.role !== "system");
      summaries.push(`### Repair\n${repair.finalText || ""}`);
      if (repair.aborted) {
        aborted = true;
      } else {
        opts.onDeepStatus?.("deep · re-verify");
        verdict = await verifyDeepDone(opts.config, plan, summaries);
        deepVerifyOk = verdict.ok && (!verdict.gaps || verdict.gaps.length === 0);
        if (!deepVerifyOk) {
          push("deep re-verify gaps", verdict.gaps.join("; "));
        } else {
          push("deep re-verify ok");
        }
      }
    } else {
      deepVerifyOk = true;
    }

    opts.onDeepStatus?.("deep · synthesizing");
    const finalText = await synthesizeDeepResult(opts.config, plan, summaries);
    appendMessage({
      sessionId: session.id,
      role: "assistant",
      content: finalText,
    });
    push("deep complete", finalText.slice(0, 160));

    const usageText = usageParts.filter(Boolean).join("\n---\n");
    opts.onUsage?.(usageText);

    return {
      sessionId: session.id,
      finalText,
      steps: totalSteps,
      messages: [
        ...history,
        { role: "assistant", content: finalText },
      ],
      toolCallCount: totalTools,
      toolOkCount: totalOk,
      usageText,
      aborted,
      deepVerifyOk,
    };
  }

  const finalText = summaries.join("\n\n") || "Deep run aborted.";
  return {
    sessionId: session.id,
    finalText,
    steps: totalSteps,
    messages: history,
    toolCallCount: totalTools,
    toolOkCount: totalOk,
    usageText: usageParts.join("\n"),
    aborted: true,
    deepVerifyOk: false,
  };
}

/** Single-pass agent loop (no deep triage). */
async function runAgentPass(opts: AgentRunOptions): Promise<AgentRunResult> {
  const rhythm = opts.rhythm ?? "act";
  const quiet = opts.quiet ?? false;
  const lens = getLens(opts.lensId);
  const theater = new MissionTheater({ silent: quiet });
  const usage = createUsageTracker(opts.config.model);

  const session =
    opts.sessionId
      ? { id: opts.sessionId }
      : createSession({
          lens: lens.id,
          workspace: opts.workspace,
          title: opts.userMessage,
        });

  const push = (kind: TraceEvent["kind"], summary: string, detail?: string) => {
    const ev = theater.push(kind, summary, detail);
    appendTrace(session.id, ev);
    opts.onEvent?.(ev);
    return ev;
  };

  touchSession(session.id, lens.id);
  if (!opts.sessionId) {
    snapshotWorkspace(opts.workspace, session.id);
  }
  push("rhythm", `rhythm=${rhythm} lens=${lens.id} model=${opts.config.model}`);
  push("user", opts.userMessage.slice(0, 200));

  // Auto-ingest project map when empty/stale for coding lenses
  if (
    (lens.id === "code" || lens.id === "atelier" || lens.private) &&
    lens.tools.includes("project_ingest")
  ) {
    try {
      const { isProjectMapStale } = await import("./contextPack.js");
      if (isProjectMapStale(opts.workspace)) {
        push("system", "auto-ingest · project map empty/stale");
        const ingestCtx: ToolContext = {
          workspace: opts.workspace,
          lens: lens.id,
          approvalMode: opts.config.approvalMode,
          allowlistBash: opts.config.allowlistBash,
          rhythm,
          signal: opts.signal,
        };
        const ing = await runTool("project_ingest", "{}", ingestCtx);
        push(
          "system",
          `auto-ingest → ${ing.ok ? "ok" : "err"} · ${ing.output.slice(0, 120)}`,
        );
      }
    } catch {
      /* non-fatal */
    }
  }

  const system = assembleSystemPrompt({
    lens,
    workspace: opts.workspace,
    rhythm,
    locale: opts.config.locale,
    leanMode: opts.config.leanMode,
  });

  // Token budget: automatically compress a long history before it overflows
  // the model context, so long sessions stay cheap and never break on a 429 /
  // context-limit error. Only kicks in past a soft cap.
  // Lean mode: compact earlier (35%) and keep fewer tail messages.
  const leanMode = opts.config.leanMode;
  let hist = opts.history ?? [];
  const compactThreshold = leanMode ? 35 : 55;
  const keepTail = leanMode ? 4 : 8;
  if (hist.length > (leanMode ? 4 : 8)) {
    const probe = [
      { role: "system", content: system },
      ...hist.filter((m) => m.role !== "system"),
      { role: "user", content: opts.userMessage },
    ] as ChatMessage[];
    const { pct } = contextPct(probe, opts.config.model);
    if (pct >= compactThreshold) {
      const { messages: compactedMsgs, compacted: count, ok } =
        await compactHistory(opts.config, hist, keepTail);
      if (ok && count > 0) {
        hist = compactedMsgs;
        push("system", `history compacted · ${count} messages → summary`);
      }
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...hist.filter((m) => m.role !== "system"),
    { role: "user", content: opts.userMessage },
  ];

  appendMessage({
    sessionId: session.id,
    role: "user",
    content: opts.userMessage,
  });

  const tools = getToolDefinitions(lens.tools);
  const toolCtx: ToolContext = {
    workspace: opts.workspace,
    lens: lens.id,
    approvalMode: opts.config.approvalMode,
    allowlistBash: opts.config.allowlistBash,
    rhythm,
    signal: opts.signal,
    onApproval: (msg) => {
      push("approval", msg);
    },
  };

  let steps = 0;
  let toolCallCount = 0;
  let toolOkCount = 0;
  let finalText = "";
  let aborted = false;
  let directRetryUsed = false;
  let postEditVerified = false;
  const failCounts = new Map<string, number>();
  const maxSteps = opts.config.maxSteps ?? 40;
  const codingLens = lens.id === "code" || lens.id === "atelier" || Boolean(lens.private);

  while (steps < maxSteps) {
    if (opts.signal?.aborted) {
      aborted = true;
      push("system", "interrupted by user");
      break;
    }
    steps += 1;
    push("system", `model step ${steps}`);

    if (!quiet) process.stderr.write(chalk.dim("anique ◈ "));
    let streamed = "";

    const stream = chatStream(opts.config, {
      model: opts.config.model,
      messages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? "auto" : undefined,
      temperature: leanMode ? 0.1 : 0.3,
      ...(leanMode ? { max_tokens: 512 } : {}),
    });

    let result = await stream.next();
    while (!result.done) {
      if (opts.signal?.aborted) {
        aborted = true;
        break;
      }
      const chunk = result.value;
      if (chunk.type === "content" && chunk.content) {
        streamed += chunk.content;
        if (!quiet) process.stdout.write(chunk.content);
        opts.onToken?.(chunk.content);
      }
      if (chunk.type === "error" && chunk.error) {
        push("system", `stream error · ${chunk.error.slice(0, 160)}`);
      }
      result = await stream.next();
    }
    if (aborted) {
      push("system", "interrupted during stream");
      if (streamed.trim()) finalText = streamed;
      break;
    }
    if (streamed && !quiet) process.stdout.write("\n");

    if (!result.done) {
      aborted = true;
      push("system", "stream ended unexpectedly");
      if (streamed.trim()) finalText = streamed;
      break;
    }

    const completion = result.value;
    const assistant = completion.message;
    // Prefer streamed text if provider returned empty message content
    if ((!assistant.content || !String(assistant.content).trim()) && streamed.trim()) {
      assistant.content = streamed;
    }
    messages.push(assistant);
    appendMessage({
      sessionId: session.id,
      role: "assistant",
      content: assistant.content,
      toolCallsJson: assistant.tool_calls
        ? JSON.stringify(assistant.tool_calls)
        : null,
    });

    usage.addText(
      JSON.stringify(messages.slice(-4)),
      (assistant.content ?? "") +
        (assistant.tool_calls
          ?.map((t: { function: { arguments: string } }) => t.function.arguments)
          .join("") ?? ""),
    );
    if (assistant.content) {
      finalText = assistant.content;
      push(
        "assistant",
        assistant.content.slice(0, 160).replace(/\n/g, " "),
        assistant.content,
      );
    }

    const calls = assistant.tool_calls ?? [];
    if (!calls.length) {
      const raw = (assistant.content ?? "").trim();
      const facing = userFacingAnswer(raw);
      const emptyOrMeta = !raw || isMetaNarration(raw) || !facing;
      // Also retry if model used tools earlier but gave a uselessly short answer
      const shortAfterTools = toolCallCount > 0 && raw.length < 50 && !facing;
      const bad = emptyOrMeta || shortAfterTools;

      if (bad && !directRetryUsed && !aborted) {
        directRetryUsed = true;
        const reason = shortAfterTools
          ? "short answer after tool use — asking for proper summary"
          : "weak answer (narration/empty) — asking model again";
        push("system", reason);
        messages.push({
          role: "user",
          content: RETRY_DIRECT_ANSWER,
        });
        continue;
      }

      finalText = facing || raw;
      if (!finalText.trim()) {
        finalText =
          "I could not produce a usable answer (model returned empty or only restated the question). Try /redo or another model via /models.";
        push("system", "empty/meta answer after retry");
      }
      break;
    }

    // Parallelize independent read-only tools; run writes/side-effects sequentially
    const canParallel =
      calls.length > 1 && calls.every((c) => READ_ONLY_TOOLS.has(c.function.name));

    type CallOutcome = {
      call: (typeof calls)[0];
      name: string;
      args: string;
      toolResult: Awaited<ReturnType<typeof runTool>>;
    };

    const runOne = async (call: (typeof calls)[0]): Promise<CallOutcome> => {
      const name = call.function.name;
      const args = call.function.arguments;
      push("tool", `${name}`, args.slice(0, 400));
      const toolResult = await runTool(name, args, toolCtx);
      return { call, name, args, toolResult };
    };

    let outcomes: CallOutcome[];
    if (canParallel) {
      outcomes = await Promise.all(calls.map(runOne));
    } else {
      outcomes = [];
      for (const call of calls) {
        if (opts.signal?.aborted) {
          aborted = true;
          break;
        }
        outcomes.push(await runOne(call));
      }
    }

    let circuitTripped = false;
    for (const { call, name, args, toolResult } of outcomes) {
      toolCallCount += 1;
      if (toolResult.ok) toolOkCount += 1;

      const failKey = `${name}::${args.slice(0, 200)}`;
      if (!toolResult.ok && !toolResult.denied) {
        const n = (failCounts.get(failKey) ?? 0) + 1;
        failCounts.set(failKey, n);
        if (n >= 3) circuitTripped = true;
      } else if (toolResult.ok) {
        failCounts.delete(failKey);
      }

      let output = toolResult.output.slice(0, 50_000);
      push(
        "tool",
        `${name} → ${toolResult.ok ? "ok" : toolResult.denied ? "denied" : "err"}`,
        output.slice(0, 400),
      );

      // Post-edit verify once per turn for coding lenses
      if (
        codingLens &&
        toolResult.ok &&
        EDIT_TOOLS.has(name) &&
        !postEditVerified &&
        !aborted
      ) {
        postEditVerified = true;
        const v = runPostEditVerify(opts.workspace);
        if (v.ran) {
          const verifyNote = [
            "",
            "--- post-edit verify ---",
            `command: ${v.command}`,
            `result: ${v.ok ? "PASS" : "FAIL"}`,
            v.output.slice(0, 4000),
          ].join("\n");
          output = (output + verifyNote).slice(0, 50_000);
          push(
            "system",
            `post-edit verify · ${v.ok ? "pass" : "fail"} · ${v.command}`,
          );
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: output,
      });
      appendMessage({
        sessionId: session.id,
        role: "tool",
        content: output,
        toolName: name,
        toolCallId: call.id,
      });
    }

    if (circuitTripped) {
      push("system", "circuit breaker · same tool+args failed 3×");
      messages.push({
        role: "user",
        content:
          "CIRCUIT BREAKER: the same tool with the same arguments failed 3 times. " +
          "Stop repeating it. Change approach (different args, different tool, or ask the user) or stop.",
      });
    }
    if (aborted) break;
  }

  // Final sanitize for tool-using turns too
  if (finalText) {
    const facing = userFacingAnswer(finalText);
    if (facing) finalText = facing;
  }

  // Surface any sudo commands that need the user's password.
  const { pendingSudoCommands, clearPendingSudo } = await import(
    "../tools/registry.js"
  );
  const pendingSudo = pendingSudoCommands();
  if (pendingSudo.length > 0 && !aborted) {
    const block =
      `\n\n🔒 ${pendingSudo.length} command(s) need your password (I can't run them):\n` +
      pendingSudo.map((p) => `  $ ${p.command}`).join("\n") +
      `\nRun them yourself, or re-run after authenticating.`;
    finalText = (finalText ? finalText.trimEnd() : "") + block;
    push("system", `${pendingSudo.length} sudo command(s) handed to user`);
    // Report once per occurrence — otherwise this queue is process-lifetime
    // state and would re-surface on every future unrelated turn forever.
    clearPendingSudo();
  }

  if (toolCallCount >= 4 && !aborted) {
    push(
      "system",
      "Hard mission — consider: /skill save <name> to reuse this approach",
    );
  }

  const usageText = usage.format();
  opts.onUsage?.(usageText);

  return {
    sessionId: session.id,
    finalText,
    steps,
    messages,
    toolCallCount,
    toolOkCount,
    usageText,
    aborted,
  };
}

