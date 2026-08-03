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
  const hint = props.busy
    ? "Esc to interrupt"
    : props.unlocked
      ? "🔓 free — /lock to re-enable approvals"
      : "↑/↓ scroll · /unlock · /compose · /send · /redo · /models";
  const accent = props.unlocked ? theme.goldBright : theme.gold;

  return (
    <Box justifyContent="space-between" width={props.width} paddingX={1}>
      <Text color={accent}>
        <Text color={accent}>{props.busy ? spin : "○"}</Text>
        {" "}
        {props.status}
        {props.scrollInfo ? ` · ${props.scrollInfo}` : ""}
      </Text>
      <Text dimColor>
        {hint}
        {props.feedLength ? ` · ${props.feedLength}L` : ""}
        {props.sessionId ? ` · ${props.sessionId.slice(0, 10)}` : ""}
      </Text>
    </Box>
  );
}

