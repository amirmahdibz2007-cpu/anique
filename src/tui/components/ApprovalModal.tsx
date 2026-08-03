import React from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalDecision, RiskLevel } from "../../safety/approval.js";
import { theme } from "../theme.js";

export function ApprovalModal(props: {
  prompt: string;
  risk?: RiskLevel;
  tool?: string;
  preview?: string;
  sessionAllowCount?: number;
  permissionMode?: string;
  onDecide: (d: ApprovalDecision) => void;
}): React.ReactElement {
  useInput((input, key) => {
    if (key.return || input === "y" || input === "Y") {
      props.onDecide("unlock");
      return;
    }
    if (input === " " && props.risk === "workspace_write") {
      props.onDecide("workspace");
      return;
    }
    if (input === "s" || input === "S") {
      props.onDecide("session");
      return;
    }
    if (input === "a" || input === "A") {
      props.onDecide("always");
      return;
    }
    if (input === "n" || input === "N" || key.escape) {
      props.onDecide("deny");
    }
  });

  const riskColor =
    props.risk === "dangerous"
      ? theme.error
      : props.risk === "workspace_write"
        ? theme.warn
        : theme.primary;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.warn}
      paddingX={1}
      marginY={0}
    >
      <Text bold color={theme.warnBright}>
        ⚠ approval needed
        {props.tool ? ` · ${props.tool}` : ""}
      </Text>
      {props.risk ? (
        <Text>
          <Text color={riskColor} bold>{props.risk}</Text>
          {props.permissionMode ? (
            <Text color={theme.textDim}> · {props.permissionMode}</Text>
          ) : null}
          {props.sessionAllowCount != null ? (
            <Text color={theme.textDim}>
              {" "}· {props.sessionAllowCount} allowed
            </Text>
          ) : null}
        </Text>
      ) : null}
      <Text>{props.prompt}</Text>
      {props.preview ? (
        <Box
          borderStyle="single"
          borderColor={theme.borderDim}
          paddingX={1}
          flexDirection="column"
        >
          <Text color={theme.textDim}>preview</Text>
          <Text color={theme.text}>{props.preview.slice(0, 280)}</Text>
        </Box>
      ) : null}
      <Text bold color={theme.successBright}>
        [Enter] unlock session
      </Text>
      <Text color={theme.textDim}>
        [s] session allow · [a] always · [n] deny
      </Text>
    </Box>
  );
}
