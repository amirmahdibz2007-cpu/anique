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
    ? "agent running… (Esc to interrupt)"
    : props.modelsMode
      ? "answer prompt…"
      : props.modelReady
        ? "ask Anique…  (/compose for Persian inbox · /send)"
        : "/models to set provider";

  return (
    <Box
      borderStyle="round"
      borderColor={props.busy ? theme.faint : theme.border}
      paddingX={1}
      width={props.width}
    >
      <Text color={theme.goldBright} bold>
        ›{" "}
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
