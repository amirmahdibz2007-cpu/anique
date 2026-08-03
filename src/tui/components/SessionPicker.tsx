import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SessionRow } from "../../store/db.js";

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

/**
 * First screen on launch: continue a past chat or start new.
 */
export function SessionPicker(props: {
  sessions: SessionRow[];
  width: number;
  onResume: (session: SessionRow) => void;
  onNew: () => void;
}): React.ReactElement {
  // cursor 0 = New chat; 1..n = sessions[i-1]
  const [cursor, setCursor] = useState(props.sessions.length > 0 ? 1 : 0);
  const max = props.sessions.length; // inclusive: 0..max

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
  // map cursor to list index in display (0 = new, then sessions)
  const totalRows = 1 + props.sessions.length;
  const start = Math.max(
    0,
    Math.min(cursor - 4, Math.max(0, totalRows - window)),
  );

  const rows: Array<{ key: string; index: number; label: React.ReactNode }> =
    [];
  // New always at logical index 0
  for (let i = start; i < Math.min(totalRows, start + window); i++) {
    if (i === 0) {
      rows.push({
        key: "new",
        index: 0,
        label: (
          <Text>
            <Text bold color="green">
              New chat
            </Text>
            <Text dimColor> — start fresh</Text>
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
            <Text color="cyan">{s.lens.padEnd(7)}</Text>
            <Text> {s.title.slice(0, 42) || "(untitled)"}</Text>
            <Text dimColor>
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
      borderColor="magenta"
      paddingX={1}
      width={props.width}
      height={Math.min(20, 6 + rows.length)}
    >
      <Text bold color="magenta">
        ◆ Continue where you left off
      </Text>
      <Text dimColor>
        ↑↓ Enter · number · n = new
      </Text>
      {props.sessions.length === 0 ? (
        <Text dimColor>No past chats yet — pick New chat.</Text>
      ) : null}
      {rows.map((row) => {
        const active = row.index === cursor;
        return (
          <Text key={row.key} color={active ? "cyan" : undefined} bold={active}>
            {active ? "→" : " "}{" "}
            {row.index === 0 ? "N" : String(row.index).padStart(2)}. {row.label}
          </Text>
        );
      })}
    </Box>
  );
}
