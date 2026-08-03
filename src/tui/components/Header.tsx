import React from "react";
import { Box, Text } from "ink";

/**
 * Top status header. Single line, space-efficient: identity on the left,
 * context (ctx% / cost / session) on the right.
 */
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
      borderColor="cyan"
      paddingX={1}
      justifyContent="space-between"
      width={props.cols}
    >
      <Text>
        <Text bold color="cyan">
          anique
        </Text>
        <Text color="magenta"> {props.profile}</Text>
        <Text color="green"> {props.lens}</Text>
        {props.locale === "fa" ? (
          <Text color="yellow"> fa</Text>
        ) : null}
        {props.lens === "atelier" ? (
          <Text color="magenta"> ⚠private</Text>
        ) : null}
        <Text dimColor> · </Text>
        <Text color="blue">{props.rhythm}</Text>
        <Text dimColor> · </Text>
        {props.modelReady ? (
          <Text dimColor>{props.modelLabel}</Text>
        ) : (
          <Text color="yellow">model: not set</Text>
        )}
        {props.scrollInfo ? (
          <Text color="yellow"> · {props.scrollInfo}</Text>
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
