/**
 * Copy text to the system clipboard without extra deps.
 * Prefer native tools (wl-copy / xclip / xsel / pbcopy / clip),
 * then fall back to OSC 52 for terminals that support it.
 */
import { spawnSync } from "node:child_process";

export type ClipboardResult =
  | { ok: true; method: string }
  | { ok: false; error: string };

function which(bin: string): boolean {
  const r = spawnSync("which", [bin], {
    encoding: "utf8",
    timeout: 1000,
  });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

function pipeTo(
  bin: string,
  args: string[],
  text: string,
): ClipboardResult | null {
  if (!which(bin)) return null;
  const r = spawnSync(bin, args, {
    input: text,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    // Clip tools can hang forever with no session — don't block the TUI.
    timeout: 2500,
    killSignal: "SIGKILL",
  });
  if (
    r.error?.message?.includes("TIMEDOUT") ||
    r.signal === "SIGKILL" ||
    (r.error && "code" in r.error && r.error.code === "ETIMEDOUT")
  ) {
    return { ok: false, error: `${bin}: timed out` };
  }
  if (r.status === 0) return { ok: true, method: bin };
  const err = (r.stderr || r.error?.message || `exit ${r.status}`).trim();
  return { ok: false, error: `${bin}: ${err || "failed"}` };
}

function osc52(text: string): ClipboardResult {
  try {
    const b64 = Buffer.from(text, "utf8").toString("base64");
    // BEL-terminated OSC 52; many terminals (and SSH) accept this.
    process.stdout.write(`\x1b]52;c;${b64}\x07`);
    return { ok: true, method: "osc52" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

type Attempt = () => ClipboardResult | null;

/** Build clipboard backends that match the current session. */
function clipboardAttempts(text: string): Attempt[] {
  const tries: Attempt[] = [];
  const wayland = Boolean(process.env.WAYLAND_DISPLAY);
  const x11 = Boolean(process.env.DISPLAY);
  const win = process.platform === "win32";
  const mac = process.platform === "darwin";

  if (wayland) {
    tries.push(() => pipeTo("wl-copy", [], text));
  }
  if (x11 || (!wayland && !mac && !win)) {
    // X11, or unknown Linux session — try xclip/xsel before OSC.
    tries.push(() => pipeTo("xclip", ["-selection", "clipboard"], text));
    tries.push(() => pipeTo("xsel", ["--clipboard", "--input"], text));
  }
  // wl-copy last among Linux tools if WAYLAND wasn't set but binary exists —
  // skipped above to avoid hang; timeout still guards if somehow added.
  if (mac) {
    tries.push(() => pipeTo("pbcopy", [], text));
  }
  if (win) {
    tries.push(() => pipeTo("clip", [], text));
  }
  return tries;
}

/** Copy `text` to the clipboard. Empty string is rejected. */
export function copyToClipboard(text: string): ClipboardResult {
  const body = text ?? "";
  if (!body.trim()) {
    return { ok: false, error: "nothing to copy" };
  }

  let lastFail: ClipboardResult | null = null;
  for (const tryFn of clipboardAttempts(body)) {
    const r = tryFn();
    if (!r) continue;
    if (r.ok) return r;
    lastFail = r;
  }

  const osc = osc52(body);
  if (osc.ok) return osc;
  return (
    lastFail ?? {
      ok: false,
      error: "no clipboard backend found",
    }
  );
}
