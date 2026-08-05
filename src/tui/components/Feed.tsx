import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { TraceEvent } from "../../store/db.js";
import { hasPersian, shapeForTerm } from "../../i18n/termFa.js";
import { splitThinkAnswer } from "../../agent/answerSanitize.js";
import { theme } from "../theme.js";
import { useSpinner } from "../hooks/useSpinner.js";

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

/** Icon + accent color per tool, so the feed reads like a little control panel. */
const TOOL_STYLE: Record<string, { icon: string; color: string }> = {
  read_file: { icon: "◎", color: theme.textDim },
  write_file: { icon: "✎", color: theme.warn },
  apply_patch: { icon: "⤳", color: theme.warn },
  grep: { icon: "⌕", color: theme.primary },
  glob: { icon: "⌗", color: theme.primary },
  bash: { icon: "❱", color: theme.secondary },
  memory_read: { icon: "⌂", color: theme.learn },
  memory_write: { icon: "⌂✎", color: theme.learn },
  recall: { icon: "↺", color: theme.primary },
  project_ingest: { icon: "❋", color: theme.success },
  skill_load: { icon: "◆", color: theme.secondary },
  git_status: { icon: "⎇", color: theme.model },
  git_diff: { icon: "±", color: theme.model },
  git_commit: { icon: "⎇✓", color: theme.success },
  run_tests: { icon: "✓", color: theme.success },
  list_templates: { icon: "☰", color: theme.textDim },
  read_template: { icon: "▤", color: theme.textDim },
  read_log: { icon: "▤", color: theme.textDim },
  rebuild_anique: { icon: "⟲", color: theme.evolve },
  todo_write: { icon: "☑", color: theme.secondary },
  todo_list: { icon: "☑", color: theme.secondary },
  todo_update: { icon: "☑", color: theme.secondary },
  web_search: { icon: "◐", color: theme.model },
};

function toolStyle(name: string): { icon: string; color: string } {
  return TOOL_STYLE[name] ?? { icon: "⚙", color: theme.faint };
}

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

/**
 * Wrap text to `width` for display inside a box. Persian text is already
 * soft-wrapped by shapeForTerm (which accounts for invisible bidi-isolate
 * marks) — re-chunking it by raw character count would double-wrap and can
 * split isolate marks onto the wrong line, so we only split on "\n" there.
 */
function wrapForBox(text: string, width: number): string[] {
  if (hasPersian(text)) return shapeForTerm(text, width).split("\n");
  return wrapLines(text, width);
}

/** Zero-width bidi isolate/mark chars that shapeForTerm injects — invisible, 0 columns. */
const ZERO_WIDTH = /[\u200E\u2066-\u2069]/g;

function visualLength(s: string): number {
  return [...s.replace(ZERO_WIDTH, "")].length;
}

function padTo(s: string, width: number): string {
  const len = visualLength(s);
  return len >= width ? s : s + " ".repeat(width - len);
}

/** Build a fully-closed bordered block (label baked into the top rule). */
function pushBox(
  push: (l: Omit<Line, "key">) => void,
  opts: {
    lines: string[];
    innerW: number;
    label: string;
    color: string;
    corners?: { tl: string; tr: string; bl: string; br: string; h: string; v: string };
    bold?: boolean;
    bodyColor?: string;
  },
): void {
  const c = opts.corners ?? { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };
  const totalW = opts.innerW + 4; // "v " + inner + " v"
  const labelTxt = ` ${opts.label} `;
  // total = tl + h + labelTxt + h*dashCount + tr
  const dashCount = Math.max(2, totalW - labelTxt.length - 3);
  push({
    text: `${c.tl}${c.h}${labelTxt}${c.h.repeat(dashCount)}${c.tr}`,
    color: opts.color,
    bold: opts.bold,
  });
  for (const ln of opts.lines) {
    push({
      text: `${c.v} ${padTo(ln, opts.innerW)} ${c.v}`,
      color: opts.bodyColor ?? theme.text,
    });
  }
  push({
    text: `${c.bl}${c.h.repeat(totalW - 2)}${c.br}`,
    color: opts.color,
    dim: true,
  });
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
          summary: `${toolBuf.length} tools · ${names}`,
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
  spinFrame = "◈",
): Line[] {
  const innerW = Math.max(12, width - 8);
  const lines: Line[] = [];
  let n = 0;
  const push = (partial: Omit<Line, "key">) => {
    lines.push({ ...partial, key: `L${n++}` });
  };

  for (const item of collapseToolEvents(items)) {
    if (item.kind === "user") {
      pushBox(push, {
        lines: wrapForBox(item.text, innerW),
        innerW,
        label: "◇ you",
        color: theme.secondaryBright,
      });
      continue;
    }
    if (item.kind === "assistant") {
      const { think, answer } = splitThinkAnswer(item.text);
      const shown = answer || item.text;
      if (think && answer) {
        const th = think.length > 400
          ? "  " + think.slice(0, 400).replace(/\n/g, "\n  ") + "\n  …"
          : "  " + think.replace(/\n/g, "\n  ");
        push({ text: th, color: theme.faint, dim: true });
      }
      const body =
        shown.length > 200_000 ? shown.slice(0, 200_000) + "\n…" : shown;
      pushBox(push, {
        lines: wrapForBox(body, innerW),
        innerW,
        label: "✦ anique",
        color: theme.primary,
        bold: true,
        corners: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
      });
      continue;
    }
    if (item.kind === "system") {
      push({
        text: `· ${showText(item.text.split("\n")[0] || "", innerW)}`,
        dim: true,
      });
      continue;
    }

    if (item.event.kind === "rhythm") {
      push({ text: `◇ ${item.event.summary}`, color: theme.model, dim: true });
      continue;
    }
    if (item.event.kind === "system") {
      const learn = /^(learning|learned|skipped learn)/.test(item.event.summary);
      const lean = /^lean\b/i.test(item.event.summary);
      const compacted = /^history compacted/i.test(item.event.summary);
      push({
        text: `${learn ? "◆" : lean ? "◈" : compacted ? "↺" : "·"} ${item.event.summary}`,
        color: learn ? theme.learn : lean ? theme.primary : compacted ? theme.info : undefined,
        dim: !learn && !lean,
      });
      continue;
    }
    if (item.event.kind === "approval") {
      push({ text: `? ${item.event.summary}`, color: theme.warnBright });
      continue;
    }
    {
      const name = item.event.summary.split(" ")[0] || item.event.summary;
      const style = toolStyle(name);
      push({
        text: `${style.icon} ${item.event.summary}`,
        color: style.color,
        dim: !TOOL_STYLE[name],
      });
    }
  }

  if (streamBuf) {
    const body = streamBuf.length > 8000 ? streamBuf.slice(-8000) : streamBuf;
    pushBox(push, {
      lines: wrapForBox(body, innerW),
      innerW,
      label: `${spinFrame} writing…`,
      color: theme.primaryBright,
      bold: true,
      bodyColor: theme.tertiary,
    });
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
  const spin = useSpinner(!!props.streamBuf);
  const allLines = useMemo(
    () => buildFeedLines(props.items, props.streamBuf, props.width, spin),
    [props.items, props.streamBuf, props.width, spin],
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
      borderStyle="round"
      borderColor={theme.borderDim}
      paddingX={1}
      height={props.height}
      width={props.width}
      overflow="hidden"
    >
      {props.items.length === 0 && !props.streamBuf ? (
        <Box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
          <Text color={theme.faint}>· · ·</Text>
          <Text color={theme.textDim}>ask anything to begin — / for commands</Text>
        </Box>
      ) : (
        <>
          {hiddenAbove > 0 || hiddenBelow > 0 ? (
            <Text color={theme.textDim}>
              {hiddenAbove > 0 ? `↑ ${hiddenAbove} · ` : ""}
              scroll
              {hiddenBelow > 0 ? ` · ↓ ${hiddenBelow}` : " · bottom"}
              {scrollPercent !== "0" ? ` · ${scrollPercent}%` : ""}
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
        </>
      )}
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
