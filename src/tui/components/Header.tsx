import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

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

  const ctxBar = "█".repeat(Math.round(props.ctxPct / 10)) +
    "░".repeat(10 - Math.round(props.ctxPct / 10));

  // Compact header: everything on one line
  return (
    <Box
      borderStyle="round"
      borderColor={theme.borderDim}
      paddingX={1}
      justifyContent="space-between"
      width={props.cols}
    >
      <Text>
        <Text bold color={theme.primaryBright}>
          ◈ anique
        </Text>
        <Text color={theme.secondary}> {props.profile}</Text>
        <Text color={theme.primary}> {props.lens}</Text>
        {props.locale === "fa" ? (
          <Text color={theme.learn}> fa</Text>
        ) : null}
        {props.leanMode ? (
          <Text color={theme.warn}> ⚡lean</Text>
        ) : null}
        {props.lens === "atelier" ? (
          <Text color={theme.error}> ⚠pvt</Text>
        ) : null}
        <Text dimColor> · </Text>
        <Text color={theme.model}>{props.rhythm}</Text>
        <Text dimColor> · </Text>
        {props.modelReady ? (
          <Text color={theme.textDim}>{props.modelLabel}</Text>
        ) : (
          <Text color={theme.warn}>no model</Text>
        )}
      </Text>
      <Text color={theme.textDim}>
        [{ctxBar}] {props.ctxPct}% · ${props.costUsd.toFixed(3)}
        {props.sessionId ? ` · ${props.sessionId.slice(0, 8)}` : ""}
        {" "}
        {shortWs.slice(-28)}
      </Text>
    </Box>
  );
}
