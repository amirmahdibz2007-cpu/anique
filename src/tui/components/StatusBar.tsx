import React from "react";
import { Box, Text } from "ink";
import { useSpinner } from "../hooks/useSpinner.js";
import { theme } from "../theme.js";

export function StatusBar(props: {
  busy: boolean;
  status: string;
  width: number;
  unlocked?: boolean;
  scrollInfo?: string;
  feedLength?: number;
  sessionId?: string;
  draftPending?: boolean;
}): React.ReactElement {
  const spin = useSpinner(props.busy);

  const statusColor = props.busy
    ? theme.primaryBright
    : props.status.startsWith("error")
      ? theme.error
      : props.status.startsWith("done")
        ? theme.success
        : theme.textDim;

  return (
    <Box justifyContent="space-between" width={props.width} paddingX={1}>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text color={statusColor} wrap="truncate-end">
          {props.busy ? (
            <Text color={theme.accent} bold>
              {spin}
            </Text>
          ) : (
            "◈"
          )}{" "}
          {props.status}
          {props.scrollInfo ? (
            <Text color={theme.textDim}> · {props.scrollInfo}</Text>
          ) : null}
          {props.draftPending ? (
            <Text color={theme.warn}> · ✎ draft pending · /send</Text>
          ) : null}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={theme.textDim} wrap="truncate-end">
          {props.busy ? <Text color={theme.warnBright}>Esc to stop</Text> : ""}
          {!props.busy && props.unlocked ? (
            <Text color={theme.warnBright}>🔓 unlocked</Text>
          ) : null}
          {props.feedLength ? ` · ${props.feedLength}L` : ""}
          {props.sessionId ? ` · ⬡${props.sessionId.slice(0, 8)}` : ""}
        </Text>
      </Box>
    </Box>
  );
}
