/**
 * "Aurora" theme — a true-color (hex) palette for a modern, premium TUI.
 * Ink 5 forwards hex colors straight to chalk's truecolor renderer, so we
 * lean on a cyan → violet → pink aurora identity instead of the flat
 * 16-color ANSI palette most terminal apps default to.
 *
 * User = sky blue | Anique = cyan/teal | Brand accents = violet + pink
 * Status: green/red pass/fail, amber active/caution.
 */

/** Raw swatches — the only place actual hex values live. */
export const swatch = {
  base: "#c7d0f0",
  dim: "#6b7394",
  faint: "#3b4261",

  cyan: "#66d9ef",
  cyanBright: "#9af0ff",
  violet: "#bb9af7",
  violetBright: "#d3bbff",
  pink: "#ff79c6",
  pinkBright: "#ffa3d7",
  blue: "#7aa2f7",
  blueBright: "#9dc0ff",

  green: "#9ece6a",
  greenBright: "#c3f27e",
  amber: "#e0af68",
  amberBright: "#ffc777",
  red: "#f7768e",
  redBright: "#ff8fa3",

  white: "#f2f4ff",
} as const;

/** Cyan → violet → pink sweep used for wordmarks / hero highlights. */
export const AURORA = [
  swatch.cyan,
  swatch.cyanBright,
  swatch.violet,
  swatch.violetBright,
  swatch.pink,
] as const;

/** Calm cyan → blue sweep for quieter accents (rules, dividers). */
export const HORIZON = [swatch.cyan, swatch.blue, swatch.violet] as const;

export const theme = {
  // ── Surface & text ──
  text: swatch.white,
  textDim: swatch.dim,
  faint: swatch.faint,

  // ── Borders ──
  border: swatch.cyan,
  borderDim: swatch.faint,
  borderModal: swatch.violetBright,

  // ── Primary accents ──
  primary: swatch.cyan,
  primaryBright: swatch.cyanBright,
  secondary: swatch.violet,
  secondaryBright: swatch.violetBright,
  tertiary: swatch.white,

  // ── Semantic ──
  success: swatch.green,
  successBright: swatch.greenBright,
  warn: swatch.amber,
  warnBright: swatch.amberBright,
  error: swatch.red,
  errorBright: swatch.redBright,
  info: swatch.cyan,

  // ── Special ──
  evolve: swatch.violet,
  evolveBright: swatch.violetBright,
  learn: swatch.amber,
  learnBright: swatch.amberBright,
  model: swatch.blue,
  active: swatch.cyanBright,

  // ── Brand accent (pink) — used sparingly for "wow" moments ──
  accent: swatch.pink,
  accentBright: swatch.pinkBright,

  // ── Legacy aliases (kept so existing call-sites keep compiling) ──
  goldBright: swatch.cyanBright,
  gold: swatch.cyan,
  amber: swatch.amberBright,
  heading: swatch.cyanBright,
  muted: swatch.dim,
  cyan: swatch.cyan,
} as const;

export type ThemeColor = (typeof theme)[keyof typeof theme];
