import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { TraceEvent } from "../../store/db.js";
import { hasPersian, shapeForTerm } from "../../i18n/termFa.js";
import { splitThinkAnswer } from "../../agent/answerSanitize.js";
import { theme } from "../theme.js";

export type FeedItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "event"; event: TraceEvent }
  | { id: string; kind: "system"; text: string };

export { splitThinkAnswer };

type Line = {
  key: string;
  text: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
};

function wrapLines(text: string, width: number): string[] {
  const w = Math.max(8, width);
  const out: string[] = [];
  for (const raw of (text || "").split("\n")) {
    if (!raw.length) {
      out.push("");
      continue;
    }
    const chars = [...raw];
    for (let i = 0; i < chars.length; i += w) {
      out.push(chars.slice(i, i + w).join(""));
    }
  }
  return out.length ? out : [""];
}

function showText(text: string, width: number): string {
  return hasPersian(text) ? shapeForTerm(text, width) : text;
}

/** Collapse consecutive tool events only — never mix learn/rhythm into ⚙. */
function collapseToolEvents(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  let toolBuf: TraceEvent[] = [];
  let toolId = "";
  const flush = () => {
    if (!toolBuf.length) return;
    if (toolBuf.length === 1) {
      out.push({ id: toolId, kind: "event", event: toolBuf[0]! });
    } else {
      const last = toolBuf[toolBuf.length - 1]!;
      const names = toolBuf
        .map((e) => e.summary.split(" ")[0] || e.summary)
        .slice(0, 4)
        .join(", ");
      out.push({
        id: toolId,
        kind: "event",
        event: {
          ...last,
          summary: `⚙ ${toolBuf.length} tools · ${names}`,
          detail: undefined,
        },
      });
    }
    toolBuf = [];
    toolId = "";
  };
  for (const item of items) {
    if (item.kind === "event" && item.event.kind === "tool") {
      if (!toolBuf.length) toolId = item.id;
      toolBuf.push(item.event);
      continue;
    }
    flush();
    out.push(item);
  }
  flush();
  return out;
}

export function buildFeedLines(
  items: FeedItem[],
  streamBuf: string,
  width: number,
): Line[] {
  const contentW = Math.max(16, width - 6);
  const lines: Line[] = [];
  let n = 0;
  const push = (partial: Omit<Line, "key">) => {
    lines.push({ ...partial, key: `L${n++}` });
  };

  for (const item of collapseToolEvents(items)) {
    if (item.kind === "user") {
      push({ text: "┌ you", color: theme.gold, bold: true });
      for (const ln of wrapLines(showText(item.text, contentW), contentW)) {
        push({ text: `│ ${ln}`, color: theme.text });
      }
      push({ text: "└", color: theme.gold, dim: true });
      continue;
    }
    if (item.kind === "assistant") {
      const { think, answer } = splitThinkAnswer(item.text);
      const shown = answer || item.text;
      if (think && answer) {
        push({ text: "┌ think", color: theme.faint, dim: true });
        const th = think.length > 800 ? think.slice(0, 800) + "\n…" : think;
        for (const ln of wrapLines(showText(th, contentW), contentW)) {
          push({ text: `│ ${ln}`, dim: true });
        }
        push({ text: "└", color: theme.faint, dim: true });
      }
      push({ text: "┌ answer", color: theme.goldBright, bold: true });
      const body =
        shown.length > 200_000 ? shown.slice(0, 200_000) + "\n…" : shown;
      for (const ln of wrapLines(showText(body, contentW), contentW)) {
        push({ text: `│ ${ln}`, color: theme.text });
      }
      push({ text: "└", color: theme.goldBright, dim: true });
      continue;
    }
    if (item.kind === "system") {
      push({
        text: `· ${showText(item.text.split("\n")[0] || "", contentW)}`,
        dim: true,
      });
      continue;
    }

    if (item.event.kind === "rhythm") {
      push({ text: `◇ ${item.event.summary}`, dim: true });
      continue;
    }
    if (item.event.kind === "system") {
      const learn = /^(learning|learned|skipped learn)/.test(item.event.summary);
      push({
        text: `${learn ? "◆" : "·"} ${item.event.summary}`,
        color: learn ? theme.goldBright : undefined,
        dim: !learn,
      });
      continue;
    }
    if (item.event.kind === "approval") {
      push({ text: `? ${item.event.summary}`, color: theme.amber });
      continue;
    }
    push({
      text: `⚙ ${item.event.summary}`,
      color: item.event.kind === "tool" ? theme.faint : theme.gold,
      dim: item.event.kind === "tool",
    });
  }

  if (streamBuf) {
    push({ text: "┌ streaming…", color: "yellow", bold: true });
    const body =
      streamBuf.length > 8000 ? streamBuf.slice(-8000) : streamBuf;
    for (const ln of wrapLines(showText(body, contentW), contentW)) {
      push({ text: `│ ${ln}`, color: "yellow" });
    }
    push({ text: "└", color: "yellow", dim: true });
  }

  return lines;
}

export function Feed(props: {
  items: FeedItem[];
  streamBuf: string;
  height: number;
  scrollLines: number;
  width: number;
}): React.ReactElement {
  const allLines = useMemo(
    () => buildFeedLines(props.items, props.streamBuf, props.width),
    [props.items, props.streamBuf, props.width],
  );

  const viewH = Math.max(3, props.height - 1);
  const maxScroll = Math.max(0, allLines.length - viewH);
  const scroll = Math.min(Math.max(0, props.scrollLines), maxScroll);
  const start = Math.max(0, allLines.length - viewH - scroll);
  const visible = allLines.slice(start, start + viewH);
  const hiddenAbove = start;
  const hiddenBelow = scroll;
  const scrollPercent = maxScroll > 0 ? (scroll / maxScroll * 100).toFixed(0) : "0";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.border}
      paddingX={1}
      height={props.height}
      width={props.width}
      overflow="hidden"
    >
      {hiddenAbove > 0 || hiddenBelow > 0 ? (
        <Text dimColor>
          {hiddenAbove > 0 ? `↑ ${hiddenAbove} · ` : ""}
          PgUp/PgDn scroll
          {hiddenBelow > 0 ? ` · ↓ ${hiddenBelow} more` : " · bottom"}
          {scrollPercent !== "0" ? ` · 📜 ${scrollPercent}%` : ""}
        </Text>
      ) : null}
      {visible.map((ln) => (
        <Text
          key={ln.key}
          color={ln.color}
          dimColor={ln.dim}
          bold={ln.bold}
          wrap="truncate-end"
        >
          {ln.text}
        </Text>
      ))}
    </Box>
  );
}

export function feedMaxScroll(
  items: FeedItem[],
  streamBuf: string,
  width: number,
  height: number,
): number {
  const lines = buildFeedLines(items, streamBuf, width);
  return Math.max(0, lines.length - Math.max(3, height - 1));
}
