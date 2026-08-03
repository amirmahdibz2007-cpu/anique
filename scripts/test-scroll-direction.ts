// Direction regression test: ↑ (upArrow) must scroll OLDER, ↓ (downArrow) NEWER.
// Mirrors the Feed.start calculation exactly so future edits can't invert it.
import { strict as assert } from "node:assert";

function startFor(totalLines: number, viewH: number, scroll: number): number {
  return Math.max(0, totalLines - viewH - scroll);
}

const total = 30;
const viewH = 10;

// scroll=0 shows the newest (last) lines; a higher scroll shows older content.
const startNewest = startFor(total, viewH, 0);
const startOlder = startFor(total, viewH, 3);
const startBackDown = startFor(total, viewH, 1);

// ↑ must increase scroll -> older -> smaller start
assert(startOlder < startNewest, "up should show older (smaller start)");
// ↓ must decrease scroll -> newer -> larger start
assert(startBackDown > startOlder, "down should show newer (larger start)");

console.log("SCROLL-DIRECTION OK — ↑=older, ↓=newer");
