import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export function MissionStrip(props: {
  width: number;
  busy: boolean;
  status: string;
  lens: string;
  workspace: string;
  feedLength: number;
  project?: string;
  hasModel: boolean;
  unlocked: boolean;
}): React.ReactElement {
  const project = props.project || props.workspace.split("/").filter(Boolean).pop() || "default";
  const state = props.busy ? "● RUNNING" : "○ READY";
  const stateColor = props.busy ? theme.goldBright : theme.gold;

  return (
    <Box
      borderStyle="single"
      borderColor={theme.faint}
      paddingX={1}
      width={props.width}
      justifyContent="space-between"
    >
      <Text>
        <Text color={stateColor} bold>{state}</Text>
        <Text dimColor>  ·  </Text>
        <Text color={theme.goldBright} bold>{project}</Text>
        <Text dimColor>  /  </Text>
        <Text color={theme.accent}>{props.lens}</Text>
        <Text dimColor>  /  </Text>
        <Text color={props.unlocked ? theme.goldBright : theme.text}>
          {props.unlocked ? "UNLOCKED" : "protected"}
        </Text>
      </Text>
      <Text dimColor>
        {props.hasModel ? "AI ready" : "model missing"} · {props.feedLength} events · {props.status}
      </Text>
    </Box>
  );
}

export default MissionStrip;