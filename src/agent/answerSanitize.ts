/**
 * Free / weak models often emit internal monologue as the whole reply:
 * "The user is asking about X." — never a real answer.
 */

const META_LINE =
  /^(?:the user\b|user (?:is |asks|wants|said|requested)|looking at (?:the )?(?:request|question)|i (?:need to|should|will|must|am going to)\b|okay[,.]?\s+i\b|let me\b|first[,.]?\s+i\b|as an ai\b|based on (?:the )?(?:question|request)\b)/i;

const META_ONLY =
  /^(?:the user (?:is asking|wants|said|requested|asked)|user (?:asks|wants|is asking)|this (?:question|request) is about)\b/i;

export function isMetaNarration(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  // Single short paragraph that only restates intent
  if (t.length < 280 && META_ONLY.test(t) && t.split(/\n/).length <= 3) {
    // No substantive follow-up after first sentence
    const after = t.replace(/^[^.!?\n]+[.!?]?/, "").trim();
    if (!after || after.length < 25) return true;
  }
  // Entire body is only meta lines
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines.every((l) => META_LINE.test(l) && l.length < 200)) {
    return true;
  }
  return false;
}

/**
 * Split tagged thinking blocks, then strip leading meta narration lines
 * so the visible "answer" is what the user should read.
 */
export function splitThinkAnswer(text: string): {
  think: string;
  answer: string;
} {
  const raw = text || "";
  const patterns = [
    /<think>([\s\S]*?)<\/think>/i,
    /<thinking>([\s\S]*?)<\/thinking>/i,
    /◁think▷([\s\S]*?)◁\/think▷/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) {
      const think = m[1]!.trim();
      const rest = raw.replace(m[0], "").trim();
      const cleaned = stripLeadingMeta(rest || "");
      return {
        think: [think, cleaned.think].filter(Boolean).join("\n").trim(),
        answer: cleaned.answer || rest,
      };
    }
  }

  const heur = raw.match(
    /^(?:thinking|reasoning|thoughts)\s*[:：]\s*([\s\S]*?)(?:\n\s*\n)([\s\S]+)$/i,
  );
  if (heur) {
    const cleaned = stripLeadingMeta(heur[2]!.trim());
    return {
      think: [heur[1]!.trim(), cleaned.think].filter(Boolean).join("\n"),
      answer: cleaned.answer || heur[2]!.trim(),
    };
  }

  return stripLeadingMeta(raw);
}

export function stripLeadingMeta(text: string): {
  think: string;
  answer: string;
} {
  const parts = (text || "").split(/\n/);
  const meta: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const line = parts[i]!.trim();
    if (!line) {
      // allow one blank inside meta preamble
      if (meta.length && i + 1 < parts.length && META_LINE.test(parts[i + 1]!.trim())) {
        i += 1;
        continue;
      }
      break;
    }
    if (META_LINE.test(line) && line.length < 220) {
      meta.push(line);
      i += 1;
      continue;
    }
    break;
  }
  const answer = parts.slice(i).join("\n").trim();
  return { think: meta.join("\n"), answer: answer || (meta.length ? "" : text.trim()) };
}

/** Strip the user's question if the model echoed it back at the top. */
const ECHO_RE =
  /^(?:here(?:'s| is) (?:the |your )?(?:answer|response|reply)[\s:：]*|)?(?:the (?:user|question) (?:is|asks|wants|said|about)\b.*?\n\n)/i;

function stripQuestionEcho(text: string): string {
  // Only strip if the echo is clearly a preamble (< 300 chars before double newline)
  const m = text.match(ECHO_RE);
  if (m && m[0].length < 300) {
    const rest = text.slice(m[0].length).trim();
    if (rest.length > 20) return rest;
  }
  return text;
}

/** Prefer cleaned user-facing text; empty if only meta. */
export function userFacingAnswer(text: string): string {
  const { answer } = splitThinkAnswer(text);
  const cleaned = stripQuestionEcho(answer || "");
  if (cleaned && !isMetaNarration(cleaned)) return cleaned;
  if (cleaned && cleaned.length > 40 && !META_ONLY.test(cleaned.trim())) return cleaned;
  return "";
}

export const RETRY_DIRECT_ANSWER =
  `Your previous message was empty or only described the question (e.g. "The user is asking about…"). That is not an answer.

BAD examples (never do these):
- "The user is asking about the weather in Tehran."
- "Based on the question, I need to look up weather data."
- "Let me help you with that." (and then nothing)

GOOD examples (do these):
- "Tehran weather: 32°C, sunny. Humidity 25%."
- "I searched the codebase — the bug is in auth.ts line 42: missing await."
- "I don't have weather data. Enable web_search or give me a city name."

Now: answer the user's original question directly. No preamble. No restating. Just the answer.`;
