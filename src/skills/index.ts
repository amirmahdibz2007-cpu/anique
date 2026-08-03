import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ensureAniqueHome, aniqueHome } from "../config/index.js";

function skillDir(lens: string): string {
  ensureAniqueHome();
  const dir = join(aniqueHome(), "skills", lens);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function listSkills(lens: string): string[] {
  const dir = skillDir(lens);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function loadSkill(lens: string, name: string): string | null {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = join(skillDir(lens), `${safe}.md`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export function saveSkill(
  lens: string,
  name: string,
  content: string,
  opts?: { overwrite?: boolean },
): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "") || "skill";
  let path = join(skillDir(lens), `${safe}.md`);
  // Never silently overwrite user-tuned skills (Hermes complaint #2)
  if (existsSync(path) && !opts?.overwrite) {
    path = join(skillDir(lens), `${safe}-${Date.now().toString(36)}.md`);
  }
  writeFileSync(path, content, "utf8");
  return path;
}
