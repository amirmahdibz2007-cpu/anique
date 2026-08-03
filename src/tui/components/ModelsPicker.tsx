import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "../theme.js";

export interface PickerRow {
  id: string;
  label: string;
  hint?: string;
}

export function ModelsPicker(props: {
  title: string;
  rows: PickerRow[];
  selectedId?: string;
  onSelect: (row: PickerRow) => void;
  onAddProvider?: () => void;
  onCancel: () => void;
  width: number;
}): React.ReactElement {
  const [cursor, setCursor] = useState(0);
  const max = Math.max(0, props.rows.length - 1);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      props.onCancel();
      return;
    }
    if (input === "+") {
      props.onAddProvider?.();
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(max, c + 1));
      return;
    }
    if (key.return && props.rows[cursor]) {
      props.onSelect(props.rows[cursor]!);
      return;
    }
    const n = Number(input);
    if (n >= 1 && n <= props.rows.length) {
      props.onSelect(props.rows[n - 1]!);
    }
  });

  const window = 12;
  const start = Math.max(0, Math.min(cursor - 5, Math.max(0, props.rows.length - window)));
  const slice = props.rows.slice(start, start + window);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      width={props.width}
    >
      <Text bold color={theme.primaryBright}>
        ◈ {props.title}
      </Text>
      {slice.map((row, i) => {
        const idx = start + i;
        const active = idx === cursor;
        const sel = row.id === props.selectedId;
        return (
          <Text key={row.id} color={active ? theme.primaryBright : undefined} bold={active}>
            {active ? "›" : " "} {String(idx + 1).padStart(2)}.{" "}
            {sel ? "★" : " "}
            {row.label}
            {row.hint ? <Text color={theme.textDim}> {row.hint}</Text> : null}
          </Text>
        );
      })}
      <Text color={theme.textDim}>
        ↑↓ Enter · # jump · + add provider · q cancel
      </Text>
    </Box>
  );
}
