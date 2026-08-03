import { saveSkill } from "../skills/index.js";
import {
  appendMemoryEntry,
  appendUserPreference,
} from "./memoryStore.js";
import type { LearnItem } from "./propose.js";

export interface ApplyResult {
  item: LearnItem;
  pathOrNote: string;
}

export function applyLearnItems(
  lens: string,
  items: LearnItem[],
): ApplyResult[] {
  const out: ApplyResult[] = [];
  for (const item of items) {
    if (item.kind === "skill") {
      const body = ensureSkillShape(item);
      const path = saveSkill(lens, item.slug, body);
      out.push({ item, pathOrNote: path });
    } else if (item.kind === "memory") {
      appendMemoryEntry({
        title: item.title,
        body: `${item.body}\n\n_evidence:_ ${item.evidence}`,
        lens,
      });
      out.push({ item, pathOrNote: `MEMORY.md · ${item.title}` });
    } else {
      appendUserPreference(`${item.title}: ${item.body.slice(0, 200)}`);
      out.push({ item, pathOrNote: `USER.md · ${item.title}` });
    }
  }
  return out;
}

function ensureSkillShape(item: LearnItem): string {
  const b = item.body;
  const hasGoal = /##?\s*Goal/i.test(b);
  if (hasGoal) {
    return `# Skill: ${item.title}\n\n${b}\n`;
  }
  return [
    `# Skill: ${item.title}`,
    "",
    "## Goal",
    item.title,
    "",
    "## Steps",
    b,
    "",
    "## Evidence",
    item.evidence || "(none recorded)",
    "",
    "## Failed / Unverified",
    "- (none stated — review before reuse)",
    "",
  ].join("\n");
}
