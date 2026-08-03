import React from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalDecision, RiskLevel } from "../../safety/approval.js";

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
      props.onDecide("once");
      return;
    }
    // Space = allow every workspace write for this session (workspace_write only)
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
      ? "red"
      : props.risk === "workspace_write"
        ? "yellow"
        : "green";

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={1}
      marginY={0}
    >
      <Text bold color="yellow">
        Approval required
        {props.tool ? ` · ${props.tool}` : ""}
      </Text>
      {props.risk ? (
        <Text>
          risk: <Text color={riskColor} bold>{props.risk}</Text>
          {props.permissionMode ? (
            <Text dimColor> · mode={props.permissionMode}</Text>
          ) : null}
          {props.sessionAllowCount != null ? (
            <Text dimColor>
              {" "}
              · session allows: {props.sessionAllowCount}
            </Text>
          ) : null}
        </Text>
      ) : null}
      <Text>{props.prompt}</Text>
      {props.preview ? (
        <Box
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          flexDirection="column"
        >
          <Text dimColor>preview</Text>
          <Text color="white">{props.preview.slice(0, 280)}</Text>
        </Box>
      ) : null}
      <Text dimColor>
        [y] once — this action only
      </Text>
      {props.risk === "workspace_write" ? (
        <Text dimColor>
          [space] session — allow all workspace writes until /clear
        </Text>
      ) : null}
      <Text dimColor>
        [s] session — allow similar until /clear
      </Text>
      <Text dimColor>
        [a] always — save bash prefix to allowlist
      </Text>
      <Text dimColor>
        [n] deny — Esc also denies
      </Text>
    </Box>
  );
}
