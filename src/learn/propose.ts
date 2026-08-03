import type { AniqueConfig } from "../config/index.js";
import { chatComplete } from "../providers/openaiCompatible.js";
import type { EvidencePack } from "./evidence.js";

export type LearnKind = "skill" | "memory" | "user";

export interface LearnItem {
  id: string;
  kind: LearnKind;
  title: string;
  /** skill slug or short label */
  slug: string;
  body: string;
  reason: string;
  evidence: string;
}

function extractJson(text: string): unknown {
  const raw = (text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1]!.trim() : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in learn propose");
  return JSON.parse(body.slice(start, end + 1));
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "learned"
  );
}

export async function proposeLearnings(
  config: AniqueConfig,
  pack: EvidencePack,
): Promise<LearnItem[]> {
  const allowSkill = pack.lens !== "daily" || pack.toolCallCount >= 5;
  try {
    const res = await chatComplete(config, {
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You propose durable learnings for Anique. JSON only. Guess less — only propose what evidence supports. Max 3 items.",
        },
        {
          role: "user",
          content: [
            `Lens: ${pack.lens}`,
            `User asked: ${pack.userMessage.slice(0, 800)}`,
            `Assistant result (trim): ${pack.finalText.slice(0, 2500)}`,
            `Tools used: ${pack.toolCallCount} · ok-ish count: ${pack.toolOkCount}`,
            pack.deepVerifyOk != null
              ? `Deep verify: ${pack.deepVerifyOk}`
              : "",
            "",
            "Return ONLY:",
            `{"items":[{"kind":"skill"|"memory"|"user","title":"...","slug":"kebab","body":"...","reason":"...","evidence":"..."}]}`,
            "Rules:",
            "- skill body MUST include sections: Goal, Steps, Evidence, Failed/Unverified",
            "- memory = short project/decision note",
            "- user = durable preference (one line worth)",
            allowSkill
              ? "- skill allowed"
              : "- DO NOT propose skill for this daily/light mission; memory/user only",
            "- skip fluff; if nothing worth keeping, return {\"items\":[]}",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
    const parsed = extractJson(res.message.content ?? "") as {
      items?: Array<Partial<LearnItem>>;
    };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items
      .slice(0, 3)
      .map((it, i) => {
        const kind: LearnKind =
          it.kind === "skill" || it.kind === "user" || it.kind === "memory"
            ? it.kind
            : "memory";
        if (!allowSkill && kind === "skill") return null;
        const title = String(it.title || "Learned note").slice(0, 120);
        return {
          id: `L${i + 1}`,
          kind,
          title,
          slug: slugify(String(it.slug || title)),
          body: String(it.body || title).slice(0, 4000),
          reason: String(it.reason || "").slice(0, 300),
          evidence: String(it.evidence || pack.summary).slice(0, 300),
        } satisfies LearnItem;
      })
      .filter(Boolean) as LearnItem[];
  } catch {
    // Fallback: one memory note from summary
    if (!pack.finalText.trim()) return [];
    return [
      {
        id: "L1",
        kind: "memory",
        title: pack.userMessage.slice(0, 80) || "Mission note",
        slug: "mission-note",
        body: pack.finalText.slice(0, 800),
        reason: "Fallback summary of the mission",
        evidence: `${pack.toolCallCount} tools · session ${pack.sessionId}`,
      },
    ];
  }
}
