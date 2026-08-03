import { createInterface } from "node:readline";

export interface ClarifyQuestion {
  id: string;
  prompt: string;
  /** Ready-made options; last option is often "type my own" in the UI */
  choices: string[];
}

export interface ClarifyAnswer {
  id: string;
  answer: string;
}

/** Normalize messy model JSON into a real question with choices. */
export function normalizeClarifyQuestion(
  raw: unknown,
  index: number,
  idPrefix = "q",
): ClarifyQuestion | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const prompt = raw.trim();
    if (!prompt || /^clarify$/i.test(prompt)) return null;
    return {
      id: `${idPrefix}${index + 1}`,
      prompt,
      choices: defaultChoicesFor(prompt),
    };
  }

  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const prompt = String(
    o.prompt ?? o.question ?? o.text ?? o.ask ?? o.title ?? "",
  ).trim();
  if (!prompt || /^clarify$/i.test(prompt)) return null;

  const id = String(o.id ?? `${idPrefix}${index + 1}`);

  let choices: string[] = [];
  const rawChoices = o.choices ?? o.options ?? o.answers ?? o.alternatives;
  if (Array.isArray(rawChoices)) {
    choices = rawChoices.map((c) => String(c).trim()).filter(Boolean).slice(0, 5);
  }
  if (choices.length < 2) {
    choices = defaultChoicesFor(prompt);
  }

  return { id, prompt, choices };
}

function defaultChoicesFor(prompt: string): string[] {
  const p = prompt.toLowerCase();
  if (/stack|framework|language|runtime|lang/.test(p)) {
    return ["TypeScript / Node", "Python", "Go", "Whatever fits the repo"];
  }
  if (/auth|login|oauth|jwt/.test(p)) {
    return ["JWT sessions", "OAuth (Google/GitHub)", "Session cookies", "Skip auth for now"];
  }
  if (/ui|frontend|react|vue|next/.test(p)) {
    return ["React", "Next.js", "Plain HTML/CSS", "CLI only — no UI"];
  }
  if (/db|database|postgres|sqlite|mongo/.test(p)) {
    return ["SQLite", "PostgreSQL", "In-memory / none", "Match existing project"];
  }
  if (/scope|mvp|how far|priority/.test(p)) {
    return ["Minimal MVP", "Production-ready", "Just a sketch / plan", "Full implementation"];
  }
  return ["Yes / go ahead", "No / skip this", "Not sure — suggest a default"];
}

export function normalizeClarifyQuestions(
  raw: unknown,
  idPrefix = "q",
): ClarifyQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ClarifyQuestion[] = [];
  for (let i = 0; i < raw.length && out.length < 3; i++) {
    const q = normalizeClarifyQuestion(raw[i], i, idPrefix);
    if (q) out.push(q);
  }
  return out;
}

export interface DeepPlanTask {
  id: string;
  title: string;
  acceptance: string;
  depends_on?: string[];
  /** Hint that task may need risky bash */
  risky?: boolean;
}

export interface DeepPlan {
  goal: string;
  done_when: string[];
  tasks: DeepPlanTask[];
  questions?: ClarifyQuestion[];
}

export type PlanDecision =
  | { action: "approve" }
  | { action: "cancel" }
  | { action: "edit"; note: string };

export interface LearnItemView {
  id: string;
  kind: "skill" | "memory" | "user";
  title: string;
  slug: string;
  body: string;
  reason: string;
  evidence: string;
}

export type LearnDecision =
  | { action: "skip" }
  | { action: "keep"; keep: LearnItemView[] };

export type ClarifyHandler = (
  questions: ClarifyQuestion[],
) => Promise<ClarifyAnswer[]>;

export type PlanHandler = (plan: DeepPlan) => Promise<PlanDecision>;
export type LearnHandler = (items: LearnItemView[]) => Promise<LearnDecision>;

let clarifyHandler: ClarifyHandler | null = null;
let planHandler: PlanHandler | null = null;
let learnHandler: LearnHandler | null = null;

export function setClarifyHandler(handler: ClarifyHandler | null): void {
  clarifyHandler = handler;
}

export function setPlanHandler(handler: PlanHandler | null): void {
  planHandler = handler;
}

export function setLearnHandler(handler: LearnHandler | null): void {
  learnHandler = handler;
}

async function readlineAsk(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise<string>((resolve) => {
    rl.question(q, resolve);
  });
  rl.close();
  return answer.trim();
}

export async function askClarify(
  questions: ClarifyQuestion[],
): Promise<ClarifyAnswer[]> {
  const qs = questions.slice(0, 3);
  if (!qs.length) return [];

  if (clarifyHandler) return clarifyHandler(qs);

  if (!process.stdin.isTTY) {
    // Non-interactive: auto-pick first choice with a note
    return qs.map((q) => ({
      id: q.id,
      answer: q.choices[0] || `(auto: ${q.prompt})`,
    }));
  }

  const answers: ClarifyAnswer[] = [];
  for (const q of qs) {
    console.error(`\n? ${q.prompt}`);
    const choices = [...q.choices, "Type my own answer…"];
    choices.forEach((c, i) => console.error(`  ${i + 1}) ${c}`));
    const raw = await readlineAsk("› ");
    let answer = raw;
    const n = Number(raw);
    if (n >= 1 && n <= choices.length) {
      const picked = choices[n - 1]!;
      if (picked === "Type my own answer…") {
        answer = (await readlineAsk("Your answer › ")) || "(skipped)";
      } else {
        answer = picked;
      }
    }
    answers.push({ id: q.id, answer: answer || "(skipped)" });
  }
  return answers;
}

export async function askPlanApproval(plan: DeepPlan): Promise<PlanDecision> {
  if (planHandler) return planHandler(plan);

  if (!process.stdin.isTTY) {
    return { action: "approve" };
  }

  console.error(`\n◆ Deep plan`);
  console.error(`  Goal: ${plan.goal}`);
  console.error(`  Done when:`);
  for (const d of plan.done_when) console.error(`    - ${d}`);
  console.error(`  Tasks:`);
  plan.tasks.forEach((t, i) => {
    const risk = t.risky ? " ⚠" : "";
    console.error(`    ${i + 1}. ${t.title}${risk}`);
    console.error(`       accept: ${t.acceptance}`);
  });
  const raw = (
    await readlineAsk("[y] run · [e] edit note · [n] cancel › ")
  ).toLowerCase();
  if (raw === "n" || raw === "cancel") return { action: "cancel" };
  if (raw === "e" || raw.startsWith("e ")) {
    const note =
      raw.length > 1 && raw.startsWith("e ")
        ? raw.slice(2)
        : await readlineAsk("Edit note › ");
    return { action: "edit", note: note || "" };
  }
  return { action: "approve" };
}

/** Format clarify answers into a user message block. */
export function formatClarifyBlock(answers: ClarifyAnswer[]): string {
  if (!answers.length) return "";
  return (
    "[user clarifications]\n" +
    answers.map((a) => `- ${a.id}: ${a.answer}`).join("\n")
  );
}

export async function askLearnApproval(
  items: LearnItemView[],
): Promise<LearnDecision> {
  if (!items.length) return { action: "skip" };
  if (learnHandler) return learnHandler(items);

  if (!process.stdin.isTTY) {
    return { action: "skip" };
  }

  console.error("\n◆ Anique learned something — keep it?");
  items.forEach((it, i) => {
    console.error(
      `  ${i + 1}) [${it.kind}] ${it.title}\n     why: ${it.reason}\n     evidence: ${it.evidence}`,
    );
  });
  const raw = (
    await readlineAsk("[y] keep all · [n] skip · or numbers like 1,3 › ")
  ).toLowerCase();
  if (!raw || raw === "n" || raw === "skip") return { action: "skip" };
  if (raw === "y" || raw === "yes" || raw === "all") {
    return { action: "keep", keep: items };
  }
  const keep: LearnItemView[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const n = Number(part);
    if (n >= 1 && n <= items.length) keep.push(items[n - 1]!);
  }
  if (!keep.length) return { action: "skip" };
  return { action: "keep", keep };
}
