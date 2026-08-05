import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";

export function Prompt(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  busy: boolean;
  modelsMode: boolean;
  modelReady: boolean;
  focused: boolean;
  width: number;
}): React.ReactElement {
  const placeholder = props.busy
    ? "working… (Esc to interrupt)"
    : props.modelsMode
      ? "pick a model…"
      : props.modelReady
        ? "ask anything… ( / for commands )"
        : "/models to get started";

  const borderColor = props.busy
    ? theme.secondary
    : props.focused
      ? theme.border
      : theme.borderDim;

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width={props.width}
    >
      <Text color={props.busy ? theme.secondaryBright : theme.primaryBright} bold>
        {props.busy ? "◈" : "❯"}{" "}
      </Text>
      <Box flexGrow={1}>
        <TextInput
          value={props.value}
          onChange={props.onChange}
          onSubmit={(v) => void props.onSubmit(v)}
          placeholder={placeholder}
          focus={props.focused}
        />
      </Box>
    </Box>
  );
}
