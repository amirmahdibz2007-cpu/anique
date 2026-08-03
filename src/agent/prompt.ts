import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LensDefinition } from "../lenses/index.js";
import { readMemoryFile } from "../memory/files.js";
import { recentMemoryForPrompt } from "../learn/memoryStore.js";
import { projectMemoryForPrompt } from "../learn/projectMemory.js";
import { listSkills } from "../skills/index.js";
import { FA_SYSTEM_ADDENDUM, LEAN_ADDENDUM } from "../i18n/termFa.js";
import {
  CAREFUL_ADDENDUM,
  shouldUseCarefulPrompt,
} from "../profiles/privateCare.js";
import { ATELIER_LENS_ID } from "../lenses/privateLenses.js";

const SOUL = `You are Anique — a multi-domain terminal agent.
One core. Many lenses. BYOK. Portable. Not an IDE clone and not a messaging gateway.
Be honest about uncertainty. Prefer tools over guessing. Respect approval gates.
Never claim a task succeeded when tools failed, were skipped, or results were unverified.
Rhythms: plan = investigate + design; act = execute with tools.
Personalize using USER.md / MEMORY.md / workspace ANIQUE.md — do not assume a specific country, publication, or product unless those files say so.
When a hard multi-step task succeeds, Anique may propose a LearnCard — never silently overwrite skills.
Use recall tool for past mission notes when relevant.

## Answering (critical)
- Answer the user directly. Never reply with only narration like "The user is asking about…".
- Do not paste internal planning as the final answer. If you think first, still end with the real answer.
- If you lack data (e.g. hardware health), say what you would need or run tools — do not stop at restating the question.
- Match depth to the question: short factual → short answer. Multi-step task → structured response.
- If the user asks "what is X?" give the definition and a brief example — do not write an essay.
- Never repeat or rephrase the user's question back to them.
- If you have the answer from context (system prompt, memory, workspace files), give it immediately without unnecessary tool calls.

## Tool use — be efficient
- Read a file once, remember its contents. Do not re-read files you already read this turn.
- Batch independent tool calls together. Call read_file + search_files in parallel when possible.
- After tool work, summarize the result directly. Do not narrate each step.
- If a tool returns an error, try a different tool or approach — do not give up.

## Self-check before answering
Before your final response, quickly verify:
1. Does this actually answer the user's question? (not just restate it)
2. Did I verify tool results? (not assume success)
3. Is the depth appropriate? (not a one-liner for a complex task, not an essay for a yes/no)
`;

export function assembleSystemPrompt(opts: {
  lens: LensDefinition;
  workspace: string;
  rhythm: "plan" | "act";
  locale?: "en" | "fa";
  leanMode?: boolean;
}): string {
  const parts: string[] = [SOUL];

  if (opts.leanMode) {
    parts.push(LEAN_ADDENDUM);
  }

  if (
    shouldUseCarefulPrompt() ||
    opts.lens.id === ATELIER_LENS_ID ||
    opts.lens.private
  ) {
    parts.push(CAREFUL_ADDENDUM);
  }

  if (opts.locale === "fa") {
    parts.push(FA_SYSTEM_ADDENDUM);
  }

  parts.push(
    `## Active lens: ${opts.lens.id} (${opts.lens.title})${opts.lens.private ? " [private]" : ""}\n${opts.lens.systemPrompt}`,
  );
  parts.push(`## Rhythm\nCurrent rhythm: **${opts.rhythm}**.`);
  parts.push(`## Workspace\nWorking directory: ${opts.workspace}`);

  const dnaPath = [
    join(opts.workspace, "ANIQUE.md"),
    join(opts.workspace, "PRISM.md"),
  ].find((p) => existsSync(p));
  if (dnaPath) {
    parts.push(
      `## Workspace DNA (${dnaPath.endsWith("PRISM.md") ? "PRISM.md" : "ANIQUE.md"})\n${readFileSync(dnaPath, "utf8").slice(0, 8000)}`,
    );
  }

  const userMem = readMemoryFile("user");
  parts.push(`## USER.md\n${userMem.slice(0, 3000)}`);
  parts.push(`## MEMORY (recent entries)\n${recentMemoryForPrompt(20)}`);

  if (opts.lens.id === ATELIER_LENS_ID || opts.lens.private) {
    parts.push(
      `## Project memory (atelier — durable for this workspace)\n${projectMemoryForPrompt(opts.workspace)}\n\nIf the map is empty, call project_ingest first.`,
    );
  }

  const skills = listSkills(opts.lens.id);
  if (skills.length) {
    parts.push(
      `## Available skills for this lens\n${skills.map((s) => `- ${s}`).join("\n")}\nLoad with skill_load when relevant.`,
    );
  }

  parts.push(
    `## Tooling notes\nAllowed tools: ${opts.lens.tools.join(", ")}.`,
  );

  return parts.join("\n\n");
}
