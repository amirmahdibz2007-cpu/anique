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
}): React.ReactElement {
  const home = process.env.HOME || "";
  const shortWs = props.workspace.startsWith(home)
    ? `~${props.workspace.slice(home.length)}`
    : props.workspace;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      justifyContent="space-between"
      width={props.cols}
    >
      <Text>
        <Text bold color={theme.goldBright}>
          anique
        </Text>
        <Text color={theme.gold}> {props.profile}</Text>
        <Text color={theme.heading}> {props.lens}</Text>
        {props.locale === "fa" ? (
          <Text color={theme.accent}> fa</Text>
        ) : null}
        {props.lens === "atelier" ? (
          <Text color={theme.warn}> ⚠private</Text>
        ) : null}
        <Text dimColor> · </Text>
        <Text color={theme.accent}>{props.rhythm}</Text>
        <Text dimColor> · </Text>
        {props.modelReady ? (
          <Text dimColor>{props.modelLabel}</Text>
        ) : (
          <Text color={theme.warn}>model: not set</Text>
        )}
        {props.scrollInfo ? (
          <Text color={theme.gold}> · {props.scrollInfo}</Text>
        ) : null}
      </Text>
      <Text dimColor>
        {props.ctxPct}% ctx · ${props.costUsd.toFixed(3)}
        {props.sessionId ? ` · ${props.sessionId.slice(0, 12)}` : ""}
        {" "}
        {shortWs.slice(-30)}
      </Text>
    </Box>
  );
}
