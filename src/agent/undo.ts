import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";

/** Snapshot dirty state before an agent turn so /undo can restore toward HEAD. */
export function snapshotWorkspace(
  workspace: string,
  sessionId: string,
): string | null {
  ensureAniqueHome();
  const dir = join(aniqueHome(), "undo");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(workspace, ".git"))) return null;
  try {
    const status = execSync("git status --porcelain", {
      cwd: workspace,
      encoding: "utf8",
    });
    const stamp = `${sessionId}_${Date.now()}`;
    const base = join(dir, stamp);
    writeFileSync(
      base + ".meta.json",
      JSON.stringify({ workspace, sessionId, stamp, status }, null, 2),
    );
    try {
      const diff = execSync("git diff HEAD", {
        cwd: workspace,
        encoding: "utf8",
        maxBuffer: 8_000_000,
      });
      writeFileSync(base + ".diff", diff);
    } catch {
      writeFileSync(base + ".diff", "");
    }
    writeFileSync(join(dir, "latest.txt"), stamp, "utf8");
    return stamp;
  } catch {
    return null;
  }
}

/**
 * Revert tracked files to HEAD. Does NOT rm -rf; only `git checkout -- .`
 * Untracked files created by the agent are listed but left for the user
 * unless they pass aggressive=true.
 */
export function undoLastSnapshot(opts?: {
  aggressive?: boolean;
}): { ok: boolean; message: string } {
  ensureAniqueHome();
  const latestPath = join(aniqueHome(), "undo", "latest.txt");
  if (!existsSync(latestPath)) {
    return { ok: false, message: "No undo snapshot (git workspace required)." };
  }
  const stamp = readFileSync(latestPath, "utf8").trim();
  const metaPath = join(aniqueHome(), "undo", `${stamp}.meta.json`);
  if (!existsSync(metaPath)) {
    return { ok: false, message: "Undo metadata missing." };
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    workspace: string;
    status: string;
  };
  try {
    execSync("git checkout -- .", {
      cwd: meta.workspace,
      encoding: "utf8",
    });
    let extra = "";
    if (opts?.aggressive) {
      execSync("git clean -fd", { cwd: meta.workspace, encoding: "utf8" });
      extra = " + removed untracked (aggressive)";
    } else {
      const untracked = (meta.status || "")
        .split("\n")
        .filter((l) => l.startsWith("??"))
        .map((l) => l.slice(3).trim())
        .filter(Boolean);
      if (untracked.length) {
        extra = `\nLeft untracked (delete manually if needed):\n  ${untracked.slice(0, 20).join("\n  ")}`;
      }
    }
    return {
      ok: true,
      message: `Undo OK — tracked files reset to HEAD${extra}`,
    };
  } catch (err) {
    return { ok: false, message: `Undo failed: ${String(err)}` };
  }
}
