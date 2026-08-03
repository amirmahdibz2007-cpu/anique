import { existsSync, copyFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureAniqueHome, aniqueHome } from "../config/index.js";

export function seedTemplates(): void {
  ensureAniqueHome();
  const here = dirname(fileURLToPath(import.meta.url));
  const shipped = join(here, "..", "..", "templates");
  const dest = join(aniqueHome(), "templates");
  mkdirSync(dest, { recursive: true });
  if (!existsSync(shipped)) return;
  for (const file of readdirSync(shipped)) {
    const target = join(dest, file);
    if (!existsSync(target)) {
      copyFileSync(join(shipped, file), target);
    }
  }
}
