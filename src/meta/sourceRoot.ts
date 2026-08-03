import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the Anique source checkout (where package.json + src/ live).
 * Works from tsx (src/) and compiled (dist/).
 */
export function aniqueSourceRoot(): string {
  if (process.env.ANIQUE_SOURCE?.trim()) {
    return process.env.ANIQUE_SOURCE.trim();
  }
  const here = dirname(fileURLToPath(import.meta.url));
  // src/meta or dist/meta → ../..
  const root = join(here, "..", "..");
  if (existsSync(join(root, "package.json")) && existsSync(join(root, "src"))) {
    return root;
  }
  // fallback: cwd if it looks like anique
  const cwd = process.cwd();
  if (existsSync(join(cwd, "package.json")) && existsSync(join(cwd, "src", "agent"))) {
    return cwd;
  }
  return root;
}
