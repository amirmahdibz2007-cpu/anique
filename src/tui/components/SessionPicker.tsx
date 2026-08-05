import React, { useMemo, useState } from "react";
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
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.sessions;
    return props.sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.lens.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.workspace.toLowerCase().includes(q),
    );
  }, [props.sessions, query]);

  const [cursor, setCursor] = useState(filtered.length > 0 ? 1 : 0);
  const max = filtered.length;

  // Keep cursor in range when filter shrinks
  React.useEffect(() => {
    setCursor((c) => Math.min(c, max));
  }, [max]);

  useInput((input, key) => {
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
      const ses = filtered[cursor - 1];
      if (ses) props.onResume(ses);
      return;
    }
    if (key.escape) {
      if (query) {
        setQuery("");
        return;
      }
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setCursor(1);
      return;
    }
    const n = Number(input);
    if (!query && (input === "n" || input === "N" || n === 0)) {
      props.onNew();
      return;
    }
    if (!query && n >= 1 && n <= filtered.length) {
      props.onResume(filtered[n - 1]!);
      return;
    }
    // Type to search (printable)
    if (input && !key.ctrl && !key.meta && input.length === 1 && input >= " ") {
      setQuery((q) => q + input);
      setCursor(1);
    }
  });

  const window = 12;
  const totalRows = 1 + filtered.length;
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
      const s = filtered[i - 1]!;
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
      borderColor={theme.borderModal}
      paddingX={1}
      width={props.width}
      height={Math.min(22, 8 + rows.length)}
    >
      <Text bold color={theme.secondaryBright}>
        ◈ continue or start fresh
      </Text>
      <Text color={theme.textDim}>
        ↑↓ Enter · type to search · Esc clear · n = new
      </Text>
      {query ? (
        <Text color={theme.primary}>
          ⌕ {query}
          <Text color={theme.textDim}>
            {" "}
            · {filtered.length}/{props.sessions.length}
          </Text>
        </Text>
      ) : null}
      {filtered.length === 0 ? (
        <Text color={theme.textDim}>
          {props.sessions.length === 0 ? "no past chats yet" : "no matches"}
        </Text>
      ) : null}
      {rows.map((row) => {
        const active = row.index === cursor;
        return (
          <Text
            key={row.key}
            color={active ? theme.primaryBright : undefined}
            bold={active}
          >
            {active ? "▸" : " "}{" "}
            {row.index === 0 ? "n" : String(row.index).padStart(2)}. {row.label}
          </Text>
        );
      })}
    </Box>
  );
}
