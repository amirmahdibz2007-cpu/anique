export interface EvidencePack {
  sessionId: string;
  lens: string;
  userMessage: string;
  finalText: string;
  toolCallCount: number;
  toolOkCount: number;
  steps: number;
  aborted: boolean;
  deepVerifyOk?: boolean | null;
  deepGaps?: string[];
  summary: string;
}

export function hasEnoughEvidence(
  pack: EvidencePack,
  opts?: { force?: boolean },
): { ok: boolean; why: string } {
  if (opts?.force) {
    return { ok: !pack.aborted && Boolean(pack.finalText.trim()), why: "forced /learn" };
  }
  if (pack.aborted) return { ok: false, why: "mission aborted" };
  if (!pack.finalText.trim()) return { ok: false, why: "empty answer" };

  if (pack.deepVerifyOk === false) {
    return {
      ok: false,
      why: `deep verify failed${pack.deepGaps?.length ? `: ${pack.deepGaps.join("; ")}` : ""}`,
    };
  }
  if (pack.deepVerifyOk === true) {
    return { ok: true, why: "deep verify ok" };
  }

  // daily: still allow memory/user with normal tool threshold; skill gated in propose
  const minTools = 3;
  if (pack.toolCallCount < minTools) {
    return {
      ok: false,
      why: `only ${pack.toolCallCount} tool calls (need ≥${minTools})`,
    };
  }
  return { ok: true, why: `${pack.toolCallCount} tools · not aborted` };
}
