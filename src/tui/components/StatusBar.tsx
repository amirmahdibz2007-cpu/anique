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
      <Text color={statusColor}>
        {props.busy ? spin : "○"} {props.status}
        {props.scrollInfo ? ` · ${props.scrollInfo}` : ""}
      </Text>
      <Text color={theme.textDim}>
        {props.busy ? "Esc" : ""}
        {!props.busy && props.unlocked ? "🔓" : ""}
        {props.feedLength ? ` ${props.feedLength}L` : ""}
        {props.sessionId ? ` · ${props.sessionId.slice(0, 8)}` : ""}
      </Text>
    </Box>
  );
}
