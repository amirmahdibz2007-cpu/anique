/** Arabic / Persian script block (basic + presentation + extended). */
const AR_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function hasPersian(text: string): boolean {
  return AR_RE.test(text || "");
}

/**
 * Terminal-friendly Persian display.
 * Ink + most Linux TTYs do poor BIDI; mixed LTR chrome + RTL body breaks boxes.
 * Strategy: keep layout LTR, isolate RTL runs, soft-wrap long Persian lines.
 */
export function shapeForTerm(text: string, width = 72): string {
  if (!text) return text;
  if (!hasPersian(text)) return text;

  const LRM = "\u200E";
  const RLI = "\u2067"; // Right-to-Left Isolate
  const PDI = "\u2069"; // Pop Directional Isolate

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line) => {
      if (!line.trim()) return line;
      if (!hasPersian(line)) return line;
      // Isolate RTL body so box-drawing / English titles stay LTR-stable
      const isolated = `${LRM}${RLI}${line}${PDI}${LRM}`;
      return softWrapFa(isolated, Math.max(20, width));
    })
    .join("\n");
}

/** Soft-wrap preferring spaces; falls back to char wrap for long Persian words. */
function softWrapFa(line: string, width: number): string {
  // Strip isolates for length estimate (approx: 1 cell per BMP char)
  const visible = line.replace(/[\u200E\u2066-\u2069]/g, "");
  if (visible.length <= width) return line;

  const out: string[] = [];
  let buf = "";
  let visibleLen = 0;
  for (const ch of line) {
    const isMark = /[\u200E\u2066-\u2069]/.test(ch);
    const w = isMark ? 0 : 1;
    if (visibleLen + w > width && buf) {
      out.push(buf);
      buf = "";
      visibleLen = 0;
    }
    buf += ch;
    visibleLen += w;
  }
  if (buf) out.push(buf);
  return out.join("\n");
}

export type Locale = "en" | "fa";

export function t(
  locale: Locale,
  key:
    | "you"
    | "answer"
    | "think"
    | "thinkStream"
    | "ask"
    | "busy"
    | "models"
    | "needModel"
    | "ready"
    | "redo"
    | "faOn"
    | "faOff"
    | "hints",
): string {
  if (locale === "fa") {
    const fa: Record<string, string> = {
      you: "شما",
      answer: "پاسخ",
      think: "فکر",
      thinkStream: "در حال نوشتن…",
      ask: "از انیک بپرس…",
      busy: "در حال کار… (Esc قطع)",
      models: "جواب ویزارد…",
      needModel: "/models برای تنظیم مدل",
      ready: "آماده",
      redo: "ارسال دوبارهٔ آخرین پیام",
      faOn: "حالت فارسی روشن · /en برای انگلیسی",
      faOff: "English mode · /fa for Persian",
      hints: "Esc قطع · Esc Esc خروج · /redo · /fa · /sessions",
    };
    return fa[key] ?? key;
  }
  const en: Record<string, string> = {
    you: "you",
    answer: "answer",
    think: "think",
    thinkStream: "think · streaming",
    ask: "ask Anique…",
    busy: "agent running… (Esc to interrupt)",
    models: "answer prompt…",
    needModel: "/models to set provider",
    ready: "ready",
    redo: "redo · last message",
    faOn: "Persian mode on · /en for English",
    faOff: "English mode · /fa for Persian",
    hints: "Esc interrupt · Esc Esc quit · /redo · /fa · /sessions",
  };
  return en[key] ?? key;
}

export const FA_SYSTEM_ADDENDUM = `## Language: Persian (فارسی)
The user enabled /fa (Persian replies). The TUI chrome stays English.
- Reply in clear, natural Persian (فارسی معیار) unless they paste English code/errors to discuss.
- Keep code, paths, commands, and tool names in original Latin form.
- Prefer short readable paragraphs.
- The user may paste long Persian from an external inbox (/compose → /send).
`;

export const LEAN_ADDENDUM = `## LEAN MODE — token saving (critical)
The user activated /lean for extreme token conservation.
- Reply in the absolute minimum tokens. No greetings, no filler, no restating the question.
- One-word or one-line answers when possible. Use bullet points, not paragraphs.
- Skip all meta-commentary ("Let me...", "I'll...", "Sure!").
- If a tool call is needed, make it — but skip narration before and after.
- Never apologize, never explain your reasoning unless asked.
- If the answer is in the system prompt or context, output it directly.
- Max response length: 3 sentences unless the user explicitly asks for more.
`;
