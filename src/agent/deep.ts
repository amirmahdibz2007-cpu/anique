import type { AniqueConfig } from "../config/index.js";
import { chatComplete } from "../providers/openaiCompatible.js";
import type { ChatMessage } from "../providers/types.js";
import {
  askClarify,
  askPlanApproval,
  formatClarifyBlock,
  normalizeClarifyQuestions,
  type ClarifyQuestion,
  type DeepPlan,
  type DeepPlanTask,
} from "../safety/interaction.js";
import { clearTodos, todoUpdate, todoWrite } from "./todos.js";

export type { DeepPlan, DeepPlanTask, ClarifyQuestion };
export type DeepMode = "auto" | "force" | "off";

export interface TriageResult {
  complexity: "simple" | "complex";
  clarity: "clear" | "ambiguous";
  questions: ClarifyQuestion[];
  reason: string;
}

function extractJson(text: string): unknown {
  const raw = (text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1]!.trim() : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(body.slice(start, end + 1));
}

function heuristicSimple(prompt: string): boolean {
  const p = prompt.trim();
  if (p.length < 80) return true;
  const complexHints =
    /\b(refactor|architect|migrate|implement|build|design|multi[- ]?step|entire|across|system|rewrite)\b/i;
  if (!complexHints.test(p) && p.length < 220) return true;
  return false;
}

export async function triagePrompt(
  config: AniqueConfig,
  prompt: string,
  clarifications?: string,
): Promise<TriageResult> {
  // Short clear requests: skip triage entirely
  if (!clarifications && heuristicSimple(prompt)) {
    return {
      complexity: "simple",
      clarity: "clear",
      questions: [],
      reason: "short/clear heuristic",
    };
  }

  // Longer requests: ask only high-signal questions (refined prompt)
  const user = [
    "Classify this request. Be decisive — only ask questions when truly blocked.",
    "Rules: 0 questions unless a decision fork changes architecture, risks, or scope drastically.",
    "Return ONLY JSON:",
    `{"complexity":"simple"|"complex","clarity":"clear"|"ambiguous","questions":[],"reason":"..."}`,
    "",
    `Request:\n${prompt}`,
    clarifications ? `\nUser answers:\n${clarifications}` : "",
  ].join("\n");

  try {
    const res = await chatComplete(config, {
      model: config.model,
      temperature: 0.05,
      messages: [
        {
          role: "system",
          content:
            "You are Anique triage. Be decisive. Ask questions only when a decision fork truly blocks progress. JSON only.",
        },
        { role: "user", content: user },
      ],
    });
    const parsed = extractJson(res.message.content ?? "") as TriageResult;
    const questions = normalizeClarifyQuestions(parsed.questions, "q");
    return {
      complexity: parsed.complexity === "complex" ? "complex" : "simple",
      clarity:
        parsed.clarity === "ambiguous" || questions.length
          ? "ambiguous"
          : "clear",
      questions,
      reason: String(parsed.reason || ""),
    };
  } catch {
    return {
      complexity: heuristicSimple(prompt) ? "simple" : "complex",
      clarity: "clear",
      questions: [],
      reason: "triage fallback",
    };
  }
}

export async function buildDeepPlan(
  config: AniqueConfig,
  prompt: string,
  clarifications: string,
  editNote?: string,
): Promise<DeepPlan> {
  const user = [
    "Break this request into a clean sequential plan for a coding agent.",
    "Return ONLY JSON:",
    `{"goal":"...","done_when":["..."],"tasks":[{"id":"t1","title":"...","acceptance":"...","depends_on":[],"risky":false}],"questions":[{"id":"pq1","prompt":"Concrete question?","choices":["A","B","C"]}]}`,
    "Rules:",
    "- Max 8 tasks; each task one concrete outcome with acceptance criteria",
    "- Prefer asking questions over guessing missing requirements (max 3)",
    "- Each question MUST have a real prompt (never just 'Clarify') and 2–4 choices",
    "- Mark risky=true if task likely needs destructive shell",
    "- depends_on uses task ids",
    "",
    `Request:\n${prompt}`,
    clarifications ? `\n${clarifications}` : "",
    editNote ? `\nPlanner edit note from user:\n${editNote}` : "",
  ].join("\n");

  const res = await chatComplete(config, {
    model: config.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are Anique planner. JSON only. Clean decomposition. Do not invent requirements — ask with real prompts and choices.",
      },
      { role: "user", content: user },
    ],
  });

  const parsed = extractJson(res.message.content ?? "") as DeepPlan;
  const tasks: DeepPlanTask[] = (parsed.tasks || [])
    .slice(0, 8)
    .map((t, i) => ({
      id: t.id || `t${i + 1}`,
      title: String(t.title || `Task ${i + 1}`),
      acceptance: String(t.acceptance || "Produce a concrete result"),
      depends_on: t.depends_on,
      risky: Boolean(t.risky),
    }));

  if (!tasks.length) {
    tasks.push({
      id: "t1",
      title: "Complete the user request",
      acceptance: "User request satisfied with evidence",
    });
  }

  return {
    goal: String(parsed.goal || prompt.slice(0, 200)),
    done_when: Array.isArray(parsed.done_when)
      ? parsed.done_when.map(String).slice(0, 8)
      : ["Request completed"],
    tasks,
    questions: normalizeClarifyQuestions(parsed.questions, "pq"),
  };
}

export async function verifyDeepDone(
  config: AniqueConfig,
  plan: DeepPlan,
  taskSummaries: string[],
): Promise<{ ok: boolean; gaps: string[]; repairHint?: string }> {
  try {
    const res = await chatComplete(config, {
      model: config.model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "You verify plan completion. JSON only.",
        },
        {
          role: "user",
          content: [
            `Goal: ${plan.goal}`,
            `Done when: ${JSON.stringify(plan.done_when)}`,
            `Task results:\n${taskSummaries.join("\n\n")}`,
            `Return: {"ok":true|false,"gaps":["..."],"repairHint":"..."}`,
          ].join("\n"),
        },
      ],
    });
    const parsed = extractJson(res.message.content ?? "") as {
      ok?: boolean;
      gaps?: string[];
      repairHint?: string;
    };
    return {
      ok: Boolean(parsed.ok),
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
      repairHint: parsed.repairHint,
    };
  } catch {
    return {
      ok: false,
      gaps: ["verify unavailable — refusing to claim success"],
      repairHint: "Re-check acceptance criteria manually",
    };
  }
}

export async function synthesizeDeepResult(
  config: AniqueConfig,
  plan: DeepPlan,
  taskSummaries: string[],
): Promise<string> {
  const res = await chatComplete(config, {
    model: config.model,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You write the final user-facing summary after a deep multi-task run. Be concrete. Include Done / Failed / Unverified if relevant.",
      },
      {
        role: "user",
        content: [
          `Goal: ${plan.goal}`,
          `Done when: ${plan.done_when.join("; ")}`,
          `Results:\n${taskSummaries.join("\n\n")}`,
        ].join("\n"),
      },
    ],
  });
  return res.message.content?.trim() || "Deep run finished.";
}

export function syncPlanTodos(plan: DeepPlan): void {
  clearTodos();
  todoWrite(
    plan.tasks.map((t) => ({
      id: t.id,
      content: t.title,
      status: "pending" as const,
    })),
  );
}

export function markTodo(id: string, status: "in_progress" | "completed" | "cancelled"): void {
  todoUpdate(id, { status });
}

/**
 * Interactive deep gate: clarify loops + plan approval.
 * - skip: use normal single-pass agent
 * - cancel: user aborted
 * - plan: approved deep plan
 */
export async function prepareDeepPlan(opts: {
  config: AniqueConfig;
  prompt: string;
  mode: DeepMode;
  onStatus?: (msg: string) => void;
}): Promise<
  | { kind: "skip" }
  | { kind: "cancel" }
  | { kind: "plan"; plan: DeepPlan; clarifications: string }
> {
  const { config, prompt, mode } = opts;
  if (mode === "off") return { kind: "skip" };

  let clarifications = "";

  // Fast triage: one round, quick decision
  if (mode !== "force") {
    const triage = await triagePrompt(config, prompt);
    if (triage.questions.length) {
      const answers = await askClarify(triage.questions);
      if (answers.some((a) => a.answer === "(cancelled)")) return { kind: "cancel" };
      clarifications = formatClarifyBlock(answers);
    }
    if (triage.complexity === "simple") return { kind: "skip" };
  } else {
    // /deep: more thorough
    opts.onStatus?.("triage");
    const triage = await triagePrompt(config, prompt);
    if (triage.questions.length) {
      const answers = await askClarify(triage.questions);
      if (answers.some((a) => a.answer === "(cancelled)")) return { kind: "cancel" };
      clarifications = formatClarifyBlock(answers);
    }
  }

  opts.onStatus?.("planning");
  let plan = await buildDeepPlan(config, prompt, clarifications);

  if (plan.questions?.length) {
    opts.onStatus?.("waiting on you · planning");
    const answers = await askClarify(plan.questions);
    if (answers.some((a) => a.answer === "(cancelled)")) return { kind: "cancel" };
    clarifications = [clarifications, formatClarifyBlock(answers)]
      .filter(Boolean).join("\n");
    plan = await buildDeepPlan(config, prompt, clarifications);
  }

  opts.onStatus?.("approve plan");
  const decision = await askPlanApproval(plan);
  if (decision.action === "cancel") return { kind: "cancel" };
  if (decision.action === "edit") {
    // One quick re-plan with edit note; no re-approval
    plan = await buildDeepPlan(config, prompt, clarifications, decision.note);
    const d2 = await askPlanApproval(plan);
    if (d2.action !== "approve") return { kind: "cancel" };
  }
  syncPlanTodos(plan);
  return { kind: "plan", plan, clarifications };
}

export function taskUserMessage(
  plan: DeepPlan,
  task: DeepPlanTask,
  index: number,
  total: number,
  clarifications: string,
): string {
  return [
    `[deep task ${index + 1}/${total}]`,
    `Goal: ${plan.goal}`,
    `Done when: ${plan.done_when.join("; ")}`,
    clarifications ? clarifications : "",
    "",
    `Current task (${task.id}): ${task.title}`,
    `Acceptance: ${task.acceptance}`,
    "",
    "Focus ONLY on this task. Use tools as needed. When done, summarize what you did and evidence for acceptance.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function repairUserMessage(plan: DeepPlan, gaps: string[], hint?: string): string {
  return [
    "[deep repair]",
    `Goal: ${plan.goal}`,
    `Gaps: ${gaps.join("; ") || "unspecified"}`,
    hint ? `Hint: ${hint}` : "",
    "Fix only the gaps. Be concrete.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Detect /deep or /fast slash prefix on a prompt. */
export function parseDeepFlags(raw: string): {
  mode: DeepMode;
  prompt: string;
} {
  const t = raw.trim();
  if (/^\/deep\b/i.test(t)) {
    return {
      mode: "force",
      prompt: t.replace(/^\/deep\s*/i, "").trim(),
    };
  }
  if (/^\/fast\b/i.test(t)) {
    return {
      mode: "off",
      prompt: t.replace(/^\/fast\s*/i, "").trim(),
    };
  }
  return { mode: "auto", prompt: t };
}
