import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createProfile,
  getProfile,
  useProfile,
  currentProfileName,
} from "./agentProfiles.js";
import { aniqueHome, ensureAniqueHome } from "../config/index.js";

export const PRIVATE_PROFILE = "private";

export const CAREFUL_ADDENDUM = `## Private careful mode (owner profile)
You are in the user's **private** Anique profile — maximum care, not a casual chat lens.

Rules (non-negotiable):
1. **Listen precisely** — treat every word of the user as intentional. Prefer clarifying over guessing when stakes are high.
2. **Think hard before acting** — enumerate risks, edge cases, and rollback paths briefly before destructive or wide edits.
3. **Zero silent damage** — never overwrite without keeping a prior version (tools auto-save priors). Prefer smallest correct change.
4. **Honesty over speed** — if unsure, say so. Never claim success when tools failed or results were unverified.
5. **Match the user's language** when they write Persian or English; keep code/paths in Latin.
6. **Confirm irreversible steps** (rm, force-push, mass renames, secrets) before doing them unless the user already approved in this turn.
7. **Quality bar** — polish, consistency, and completeness matter here more than elsewhere. Do it carefully and leave the workspace cleaner than you found it.
`;

const PRIVATE_USER = `# USER.md — private profile

Owner private workspace for Anique.
- Prefer careful, thorough execution.
- Match my language (Persian/English).
- When I care about quality, slow down and get it right.
`;

/**
 * Ensure the private owner profile exists (not shipped in the public package).
 */
export function ensurePrivateProfile(): {
  name: string;
  path: string;
  created: boolean;
} {
  ensureAniqueHome();
  const existing = getProfile(PRIVATE_PROFILE);
  if (existing) {
    seedPrivateFiles(existing.path);
    return { name: PRIVATE_PROFILE, path: existing.path, created: false };
  }
  const meta = createProfile({
    name: PRIVATE_PROFILE,
    description: "Owner private · maximum care · versioned writes",
    clone: false,
  });
  seedPrivateFiles(meta.path);
  return { name: PRIVATE_PROFILE, path: meta.path, created: true };
}

function seedPrivateFiles(home: string): void {
  mkdirSync(join(home, "lenses"), { recursive: true });
  mkdirSync(join(home, "skills"), { recursive: true });
  mkdirSync(join(home, "versions"), { recursive: true });
  const userPath = join(home, "USER.md");
  if (!existsSync(userPath)) {
    writeFileSync(userPath, PRIVATE_USER, "utf8");
  }
  writeFileSync(join(home, "CAREFUL"), "1\n", "utf8");
  const lensNote = join(home, "lenses", "README.private.md");
  if (!existsSync(lensNote)) {
    writeFileSync(
      lensNote,
      `# Private profile\n\nCareful-mode addendum is always on here.\nNot part of the public/shipped lens set.\n`,
      "utf8",
    );
  }
}

export function activatePrivateProfile(): {
  name: string;
  path: string;
  created: boolean;
} {
  const info = ensurePrivateProfile();
  useProfile(PRIVATE_PROFILE);
  return info;
}

/** Careful prompt when on private profile or CAREFUL marker in ANIQUE_HOME. */
export function shouldUseCarefulPrompt(): boolean {
  if (currentProfileName() === PRIVATE_PROFILE) return true;
  try {
    return existsSync(join(aniqueHome(), "CAREFUL"));
  } catch {
    return false;
  }
}
