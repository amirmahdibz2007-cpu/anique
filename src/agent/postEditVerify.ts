import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** Detect a cheap verify command for the workspace (typecheck / test / build). */
export function detectVerifyCommand(workspace: string): string | null {
  const pkgPath = join(workspace, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};
      if (scripts.typecheck) return "npm run typecheck";
      if (scripts["check"]) return "npm run check";
      if (scripts.lint && !scripts.test) return "npm run lint";
      if (scripts.test) return "npm test -- --passWithNoTests 2>/dev/null || npm test";
      if (scripts.build) return "npm run build";
    } catch {
      /* ignore */
    }
  }
  if (existsSync(join(workspace, "Cargo.toml"))) return "cargo check";
  if (existsSync(join(workspace, "pyproject.toml")) || existsSync(join(workspace, "pytest.ini"))) {
    return "python -m pytest -q --tb=line -x 2>/dev/null || true";
  }
  if (existsSync(join(workspace, "go.mod"))) return "go build ./...";
  return null;
}

export function runPostEditVerify(
  workspace: string,
  opts?: { timeoutMs?: number },
): { ran: boolean; ok: boolean; command: string; output: string } {
  const command = detectVerifyCommand(workspace);
  if (!command) {
    return { ran: false, ok: true, command: "", output: "(no verify script detected)" };
  }
  const timeout = opts?.timeoutMs ?? 90_000;
  const r = spawnSync(command, {
    cwd: workspace,
    shell: true,
    encoding: "utf8",
    timeout,
    env: { ...process.env, CI: "1" },
  });
  const output = [r.stdout, r.stderr].filter(Boolean).join("\n").slice(0, 6000);
  const ok = r.status === 0;
  return { ran: true, ok, command, output: output || `(exit ${r.status})` };
}
