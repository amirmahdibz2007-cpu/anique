import React from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalDecision, RiskLevel } from "../../safety/approval.js";
import { theme } from "../theme.js";
import { Pill } from "../widgets.js";

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
    // Enter / y = approve this action once (safe default)
    if (key.return || input === "y" || input === "Y") {
      props.onDecide("once");
      return;
    }
    // Explicit unlock for the whole session
    if (input === "u" || input === "U") {
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
      borderColor={theme.warnBright}
      paddingX={1}
      marginY={0}
    >
      <Text bold color={theme.warnBright}>
        ⚡ approval needed
        {props.tool ? ` · ${props.tool}` : ""}
      </Text>
      {props.risk ? (
        <Text>
          <Pill label={props.risk} bg={riskColor} />
          {props.permissionMode ? (
            <Text color={theme.textDim}> · {props.permissionMode}</Text>
          ) : null}
          {props.sessionAllowCount != null ? (
            <Text color={theme.textDim}>
              {" "}
              · {props.sessionAllowCount} allowed
            </Text>
          ) : null}
        </Text>
      ) : null}
      <Text>{props.prompt}</Text>
      {props.preview ? (
        <Box
          borderStyle="round"
          borderColor={theme.borderDim}
          paddingX={1}
          flexDirection="column"
        >
          <Text color={theme.textDim}>preview</Text>
          <Text color={theme.text}>{props.preview.slice(0, 280)}</Text>
        </Box>
      ) : null}
      <Text> </Text>
      <Text bold color={theme.successBright}>
        ▸ [Enter/y] approve once
      </Text>
      <Text color={theme.textDim}>
        [s] session · [a] always · [u] unlock ALL (dangerous) · [n] deny
      </Text>
    </Box>
  );
}
