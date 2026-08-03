import type { AniqueConfig } from "../config/index.js";
import type { TraceEvent } from "../store/db.js";
import { appendEpisode } from "../store/db.js";
import { askLearnApproval } from "../safety/interaction.js";
import { applyLearnItems } from "./apply.js";
import {
  hasEnoughEvidence,
  type EvidencePack,
} from "./evidence.js";
import { proposeLearnings, type LearnItem } from "./propose.js";

export interface LearningRunResult {
  proposed: LearnItem[];
  applied: Array<{ kind: string; title: string; where: string }>;
  skippedReason?: string;
  messages: string[];
}

/**
 * Evidence-gated learning after a mission.
 * Quiet for pure chat (0 tools) — that skip was confusing users in the feed.
 */
export async function runLearningPass(opts: {
  config: AniqueConfig;
  pack: EvidencePack;
  force?: boolean;
  onStatus?: (msg: string) => void;
  onEvent?: (event: TraceEvent) => void;
}): Promise<LearningRunResult> {
  const messages: string[] = [];
  const emit = (summary: string, detail?: string) => {
    messages.push(summary);
    opts.onEvent?.({
      ts: new Date().toISOString(),
      kind: "system",
      summary,
      detail,
    });
  };

  if (opts.config.learning === "off" && !opts.force) {
    emit("learning off · /learn to propose manually");
    return { proposed: [], applied: [], skippedReason: "learning off", messages };
  }

  const gate = hasEnoughEvidence(opts.pack, { force: opts.force });
  if (!gate.ok) {
    const silent =
      !opts.force &&
      (gate.why.includes("only 0 tool") ||
        gate.why.includes("empty answer") ||
        gate.why.includes("mission aborted"));
    if (!silent) {
      emit(`skipped learn · no solid evidence (${gate.why})`);
    }
    appendEpisode({
      sessionId: opts.pack.sessionId,
      lens: opts.pack.lens,
      title: opts.pack.userMessage.slice(0, 120),
      summary: opts.pack.finalText.slice(0, 1500),
      verified: false,
      gaps: [gate.why],
    });
    return { proposed: [], applied: [], skippedReason: gate.why, messages };
  }

  opts.onStatus?.("learning · reviewing mission…");
  emit("learning · reviewing mission…", gate.why);

  const proposed = await proposeLearnings(opts.config, opts.pack);
  if (!proposed.length) {
    emit("skipped learn · nothing worth keeping");
    appendEpisode({
      sessionId: opts.pack.sessionId,
      lens: opts.pack.lens,
      title: opts.pack.userMessage.slice(0, 120),
      summary: opts.pack.finalText.slice(0, 1500),
      verified: opts.pack.deepVerifyOk !== false,
      gaps: [],
    });
    return { proposed: [], applied: [], skippedReason: "empty proposals", messages };
  }

  opts.onStatus?.("waiting on you · learn");
  emit(
    `learning · ${proposed.length} proposal(s) — keep as skill/memory?`,
    proposed.map((p) => `${p.kind}:${p.title}`).join(", "),
  );

  const decision = await askLearnApproval(proposed);
  if (decision.action === "skip" || !decision.keep.length) {
    emit("skipped learn · you chose not to keep");
    appendEpisode({
      sessionId: opts.pack.sessionId,
      lens: opts.pack.lens,
      title: opts.pack.userMessage.slice(0, 120),
      summary: opts.pack.finalText.slice(0, 1500),
      verified: true,
      gaps: [],
      learnedJson: JSON.stringify({ skipped: true, proposed }),
    });
    return { proposed, applied: [], skippedReason: "user skipped", messages };
  }

  const keep = decision.keep;
  const applied = applyLearnItems(opts.pack.lens, keep);
  for (const a of applied) {
    emit(`learned · ${a.item.kind} ${a.item.title}`, a.pathOrNote);
  }

  appendEpisode({
    sessionId: opts.pack.sessionId,
    lens: opts.pack.lens,
    title: opts.pack.userMessage.slice(0, 120),
    summary: opts.pack.finalText.slice(0, 1500),
    verified: true,
    learnedJson: JSON.stringify(
      applied.map((a) => ({
        kind: a.item.kind,
        title: a.item.title,
        where: a.pathOrNote,
      })),
    ),
  });

  opts.onStatus?.("ready");
  return {
    proposed,
    applied: applied.map((a) => ({
      kind: a.item.kind,
      title: a.item.title,
      where: a.pathOrNote,
    })),
    messages,
  };
}
