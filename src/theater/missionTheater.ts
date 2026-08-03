import chalk from "chalk";
import type { TraceEvent } from "../store/db.js";

const kindColor: Record<TraceEvent["kind"], (s: string) => string> = {
  user: chalk.cyan,
  assistant: chalk.white,
  tool: chalk.yellow,
  system: chalk.gray,
  approval: chalk.magenta,
  rhythm: chalk.blue,
};

const kindGlyph: Record<TraceEvent["kind"], string> = {
  user: "▸",
  assistant: "◆",
  tool: "⚙",
  system: "·",
  approval: "?",
  rhythm: "◈",
};

export class MissionTheater {
  private events: TraceEvent[] = [];
  private silent: boolean;

  constructor(opts?: { silent?: boolean }) {
    this.silent = opts?.silent ?? false;
  }

  push(kind: TraceEvent["kind"], summary: string, detail?: string): TraceEvent {
    const event: TraceEvent = {
      ts: new Date().toISOString(),
      kind,
      summary,
      detail,
    };
    this.events.push(event);
    if (!this.silent) this.renderLive(event);
    return event;
  }

  getEvents(): TraceEvent[] {
    return [...this.events];
  }

  private renderLive(event: TraceEvent): void {
    const color = kindColor[event.kind];
    const glyph = kindGlyph[event.kind];
    const time = event.ts.slice(11, 19);
    process.stderr.write(
      `${chalk.dim(time)} ${color(glyph)} ${color(event.summary)}\n`,
    );
    if (event.detail && event.kind === "tool") {
      const preview = event.detail.length > 200
        ? event.detail.slice(0, 200) + "…"
        : event.detail;
      process.stderr.write(chalk.dim(`         ${preview.replace(/\n/g, " ⏎ ")}\n`));
    }
  }
}

export function replayTrace(events: TraceEvent[]): void {
  if (!events.length) {
    console.log(chalk.dim("No trace events."));
    return;
  }
  console.log(chalk.bold("\n══ Mission Trace Replay ══\n"));
  for (const event of events) {
    const color = kindColor[event.kind];
    const glyph = kindGlyph[event.kind];
    console.log(
      `${chalk.dim(event.ts.slice(11, 19))} ${color(glyph)} ${color(event.summary)}`,
    );
    if (event.detail) {
      const lines = event.detail.split("\n").slice(0, 12);
      for (const line of lines) {
        console.log(chalk.dim(`         ${line}`));
      }
      if (event.detail.split("\n").length > 12) {
        console.log(chalk.dim("         …"));
      }
    }
  }
  console.log();
}
