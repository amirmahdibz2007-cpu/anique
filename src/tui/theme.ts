/**
 * Modern theme — inspired by Catppuccin Mocha + Charm/Lipgloss aesthetics.
 *
 * Teal is the "Anique brand color" (not gold).
 * User prompts = sky blue | Answer = teal | Think = faint
 * Modals use double borders with teal.
 * Status: green/red pass/fail, yellow active.
 */
export const theme = {
  // ── Surface & text ──
  text: "white" as const,
  textDim: "gray" as const,
  faint: "gray" as const,

  // ── Borders ──
  border: "cyan" as const,
  borderDim: "gray" as const,
  borderModal: "cyanBright" as const,

  // ── Primary accents ──
  primary: "cyan" as const,
  primaryBright: "cyanBright" as const,
  secondary: "blue" as const,
  secondaryBright: "blueBright" as const,
  tertiary: "whiteBright" as const,

  // ── Semantic ──
  success: "green" as const,
  successBright: "greenBright" as const,
  warn: "yellow" as const,
  warnBright: "yellowBright" as const,
  error: "red" as const,
  errorBright: "redBright" as const,
  info: "cyan" as const,

  // ── Special ──
  evolve: "magenta" as const,
  evolveBright: "magentaBright" as const,
  learn: "yellow" as const,
  learnBright: "yellowBright" as const,
  model: "blue" as const,
  active: "cyanBright" as const,

  // ── Legacy aliases (mapped to new palette) ──
  goldBright: "cyanBright" as const,
  gold: "cyan" as const,
  amber: "yellowBright" as const,
  heading: "cyanBright" as const,
  accent: "cyan" as const,
  muted: "gray" as const,
  cyan: "cyan" as const,
} as const;
