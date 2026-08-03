/**
 * Gold & black theme — centralizes every color so the whole TUI can be
 * re-skinned from one place.
 *
 * Palette:
 *   goldBright: primary accent — titles, active, headings, borders
 *   gold:       secondary accent — labels, highlights
 *   amber:      warnings / risk / danger emphasis
 *   faint:      dim metadata, hints, separators
 *   text:       body text (responses, previews)
 */
export const theme = {
  goldBright: "yellowBright",
  gold: "yellow",
  amber: "yellowBright",
  faint: "gray",
  text: "white",
  border: "yellowBright",
  // Semantic aliases staying true to the palette:
  heading: "yellowBright",
  accent: "yellow",
  warn: "yellowBright",
  muted: "yellow",
} as const;
