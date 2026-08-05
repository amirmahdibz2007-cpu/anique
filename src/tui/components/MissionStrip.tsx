import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";
import { Chip } from "../widgets.js";

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

  const stateIcon = props.busy ? "◉" : "◎";
  const stateColor = props.busy ? theme.primaryBright : theme.borderDim;

  return (
    <Box
      borderStyle="single"
      borderColor={theme.borderDim}
      paddingX={1}
      width={props.width}
      justifyContent="space-between"
    >
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text wrap="truncate-end">
          <Text color={stateColor} bold>
            {stateIcon}
          </Text>
          <Text> </Text>
          <Text color={theme.secondaryBright} bold>
            {project}
          </Text>
          <Text color={theme.faint}> ▸ </Text>
          <Text color={theme.primary}>{props.lens}</Text>
          <Text color={theme.faint}> ▸ </Text>
          {props.unlocked ? (
            <Chip label="unlocked" color={theme.warnBright} />
          ) : (
            <Chip label="safe" color={theme.textDim} dim />
          )}
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text color={theme.textDim} wrap="truncate-end">
          ✦ {props.feedLength} · {props.status.slice(0, 50)}
        </Text>
      </Box>
    </Box>
  );
}
