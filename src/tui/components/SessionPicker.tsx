import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SessionRow } from "../../store/db.js";
import { theme } from "../theme.js";

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function SessionPicker(props: {
  sessions: SessionRow[];
  width: number;
  onResume: (session: SessionRow) => void;
  onNew: () => void;
}): React.ReactElement {
  const [cursor, setCursor] = useState(props.sessions.length > 0 ? 1 : 0);
  const max = props.sessions.length;

  useInput((_input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(max, c + 1));
      return;
    }
    if (key.return) {
      if (cursor === 0) {
        props.onNew();
        return;
      }
      const ses = props.sessions[cursor - 1];
      if (ses) props.onResume(ses);
      return;
    }
    const n = Number(_input);
    if (_input === "n" || _input === "N" || n === 0) {
      props.onNew();
      return;
    }
    if (n >= 1 && n <= props.sessions.length) {
      props.onResume(props.sessions[n - 1]!);
    }
  });

  const window = 12;
  const totalRows = 1 + props.sessions.length;
  const start = Math.max(
    0,
    Math.min(cursor - 4, Math.max(0, totalRows - window)),
  );

  const rows: Array<{ key: string; index: number; label: React.ReactNode }> =
    [];
  for (let i = start; i < Math.min(totalRows, start + window); i++) {
    if (i === 0) {
      rows.push({
        key: "new",
        index: 0,
        label: (
          <Text>
            <Text bold color={theme.primaryBright}>
              ✦ New chat
            </Text>
          </Text>
        ),
      });
    } else {
      const s = props.sessions[i - 1]!;
      rows.push({
        key: s.id,
        index: i,
        label: (
          <Text>
            <Text color={theme.primary}>{s.lens.padEnd(7)}</Text>
            <Text> {s.title.slice(0, 42) || "(untitled)"}</Text>
            <Text color={theme.textDim}>
              {"  "}
              {shortTime(s.updated_at)}
            </Text>
          </Text>
        ),
      });
    }
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      width={props.width}
      height={Math.min(20, 6 + rows.length)}
    >
      <Text bold color={theme.primaryBright}>
        ◈ continue or start fresh
      </Text>
      <Text color={theme.textDim}>
        ↑↓ Enter · n = new · number = jump
      </Text>
      {props.sessions.length === 0 ? (
        <Text color={theme.textDim}>no past chats yet</Text>
      ) : null}
      {rows.map((row) => {
        const active = row.index === cursor;
        return (
          <Text
            key={row.key}
            color={active ? theme.primaryBright : undefined}
            bold={active}
          >
            {active ? "›" : " "}
            {" "}
            {row.index === 0 ? "n" : String(row.index).padStart(2)}.{" "}
            {row.label}
          </Text>
        );
      })}
    </Box>
  );
}
