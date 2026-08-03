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
  const project =
    props.project ||
    props.workspace.split("/").filter(Boolean).pop() ||
    "default";

  const stateIcon = props.busy ? "●" : "○";
  const stateColor = props.busy ? theme.primaryBright : theme.textDim;

  return (
    <Box
      borderStyle="single"
      borderColor={theme.borderDim}
      paddingX={1}
      width={props.width}
      justifyContent="space-between"
    >
      <Text>
        <Text color={stateColor} bold>
          {stateIcon}{" "}
        </Text>
        <Text color={theme.primaryBright} bold>
          {project}
        </Text>
        <Text color={theme.textDim}> / </Text>
        <Text color={theme.primary}>{props.lens}</Text>
        <Text color={theme.textDim}> · </Text>
        <Text color={props.unlocked ? theme.warn : theme.textDim}>
          {props.unlocked ? "unlock" : "safe"}
        </Text>
      </Text>
      <Text color={theme.textDim}>
        {props.feedLength} · {props.status.slice(0, 50)}
      </Text>
    </Box>
  );
}
