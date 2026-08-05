import React from "react";
import { Box, Text } from "ink";
import { theme, AURORA } from "../theme.js";
import { Gradient, Pill, thresholdColor, dotBar } from "../widgets.js";

export function Header(props: {
  profile: string;
  lens: string;
  rhythm: string;
  modelLabel: string;
  modelReady: boolean;
  sessionId?: string;
  workspace: string;
  ctxPct: number;
  costUsd: number;
  cols: number;
  locale?: "en" | "fa";
  scrollInfo?: string;
  leanMode?: boolean;
}): React.ReactElement {
  const home = process.env.HOME || "";
  const shortWs = props.workspace.startsWith(home)
    ? `~${props.workspace.slice(home.length)}`
    : props.workspace;

  const ctxColor = thresholdColor(props.ctxPct);
  const ctxBar = dotBar(props.ctxPct, 10);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
      width={props.cols}
    >
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text wrap="truncate-end">
          <Gradient text="◆ anique" colors={AURORA} bold />
          <Text> </Text>
          <Pill label={props.profile} bg={theme.secondary} />
          <Text> </Text>
          <Pill
            label={props.lens}
            bg={props.lens === "atelier" ? theme.error : theme.primary}
          />
          {props.locale === "fa" ? (
            <Text color={theme.learn}> ✎fa</Text>
          ) : null}
          {props.leanMode ? <Text color={theme.warn}> ⚡lean</Text> : null}
          {props.lens === "atelier" ? (
            <Text color={theme.errorBright}> ⚠pvt</Text>
          ) : null}
          <Text dimColor> ⟩ </Text>
          <Text color={theme.model} bold>
            {props.rhythm === "plan" ? "◔ plan" : "● act"}
          </Text>
          <Text dimColor> ⟩ </Text>
          {props.modelReady ? (
            <Text color={theme.textDim}>{props.modelLabel}</Text>
          ) : (
            <Text color={theme.warnBright}>⚠ no model — /models</Text>
          )}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={theme.textDim} wrap="truncate-end">
          <Text color={ctxColor}>{ctxBar}</Text> {props.ctxPct}%
          <Text dimColor> · </Text>
          <Text color={theme.successBright}>${props.costUsd.toFixed(3)}</Text>
          {props.sessionId ? (
            <Text dimColor> · ⬡{props.sessionId.slice(0, 8)}</Text>
          ) : null}
          <Text dimColor> · </Text>
          {shortWs.slice(-28)}
        </Text>
      </Box>
    </Box>
  );
}
