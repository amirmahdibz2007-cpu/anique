/**
 * Small reusable "widgets" for the TUI — gradient text, pill badges, and
 * threshold-colored bars. Kept framework-light (plain Ink primitives) so
 * every screen shares the same premium look without duplicating logic.
 */
import React from "react";
import { Box, Text } from "ink";
import { theme } from "./theme.js";

/** Renders `text` with each character eased across a color sweep. */
export function Gradient(props: {
  text: string;
  colors: readonly string[];
  bold?: boolean;
  dim?: boolean;
}): React.ReactElement {
  const { text, colors, bold, dim } = props;
  const n = colors.length;
  const chars = [...text];
  return (
    <Text>
      {chars.map((ch, i) => {
        const t = chars.length <= 1 ? 0 : i / (chars.length - 1);
        const color = colors[Math.round(t * (n - 1))] ?? colors[n - 1]!;
        return (
          <Text key={i} color={color} bold={bold} dimColor={dim}>
            {ch}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Renders a block of pre-formatted lines (e.g. figlet ASCII art) with a
 * single color sweep applied consistently by column across every row, so
 * multi-line banners get one coherent gradient instead of per-line resets.
 */
export function GradientBlock(props: {
  lines: readonly string[];
  colors: readonly string[];
  bold?: boolean;
}): React.ReactElement {
  const { lines, colors, bold } = props;
  const n = colors.length;
  const maxW = Math.max(1, ...lines.map((l) => [...l].length));
  return (
    <Box flexDirection="column">
      {lines.map((line, li) => (
        <Text key={li} bold={bold}>
          {[...line].map((ch, i) => {
            const t = maxW <= 1 ? 0 : i / (maxW - 1);
            const color = colors[Math.round(t * (n - 1))] ?? colors[n - 1]!;
            return ch === " " ? (
              <Text key={i}> </Text>
            ) : (
              <Text key={i} color={color}>
                {ch}
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
}

/** Filled "pill" badge — bright background, dark text, for compact status chips. */
export function Pill(props: {
  label: string;
  bg?: string;
  color?: string;
  dim?: boolean;
}): React.ReactElement {
  return (
    <Text
      backgroundColor={props.bg ?? theme.primary}
      color={props.color ?? "#0b0e1a"}
      dimColor={props.dim}
      bold
    >
      {` ${props.label} `}
    </Text>
  );
}

/** Outline chip — colored text between angle brackets, no fill (quieter than Pill). */
export function Chip(props: {
  label: string;
  color?: string;
  dim?: boolean;
}): React.ReactElement {
  return (
    <Text color={props.color ?? theme.textDim} dimColor={props.dim}>
      ‹{props.label}›
    </Text>
  );
}

/** Threshold-colored block bar, e.g. context/usage meters. Higher = hotter by default. */
export function thresholdColor(pct: number, invert = false): string {
  const p = invert ? 100 - pct : pct;
  if (p >= 85) return theme.error;
  if (p >= 60) return theme.warn;
  return theme.success;
}

export function blockBar(pct: number, width: number): string {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

/** Braille dot-matrix bar — denser, more "premium terminal" look than block chars. */
export function dotBar(pct: number, width: number): string {
  const glyphs = ["⠀", "⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣷", "⣿"];
  const filled = (Math.max(0, Math.min(100, pct)) / 100) * width;
  const full = Math.floor(filled);
  const frac = filled - full;
  let out = "⣿".repeat(Math.min(full, width));
  if (full < width) {
    out += glyphs[Math.round(frac * (glyphs.length - 1))]!;
    out += "⠀".repeat(Math.max(0, width - full - 1));
  }
  return out;
}
