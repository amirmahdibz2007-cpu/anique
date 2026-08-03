import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";
import type {
  LearnDecision,
  LearnItemView,
} from "../../safety/interaction.js";

export function LearnCard(props: {
  items: LearnItemView[];
  onDecide: (d: LearnDecision) => void;
}): React.ReactElement {
  const [kept, setKept] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(props.items.map((i) => [i.id, true])),
  );
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState(props.items);

  const confirm = () => {
    const keep = items.filter((i) => kept[i.id]);
    if (!keep.length) {
      props.onDecide({ action: "skip" });
      return;
    }
    props.onDecide({ action: "keep", keep });
  };

  useInput((input, key) => {
    if (editing) return;
    if (key.escape || input === "n" || input === "N") {
      props.onDecide({ action: "skip" });
      return;
    }
    if (input === "y" || input === "Y") {
      setKept(Object.fromEntries(items.map((i) => [i.id, true])));
      props.onDecide({ action: "keep", keep: items });
      return;
    }
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(items.length - 1, c + 1));
      return;
    }
    if (input === " ") {
      const id = items[cursor]?.id;
      if (id) setKept((k) => ({ ...k, [id]: !k[id] }));
      return;
    }
    if (input === "e" || input === "E") {
      const cur = items[cursor];
      if (cur) {
        setDraft(cur.title);
        setEditing(true);
      }
      return;
    }
    if (key.return) {
      confirm();
      return;
    }
    const n = Number(input);
    if (n >= 1 && n <= items.length) {
      const id = items[n - 1]!.id;
      setKept((k) => ({ ...k, [id]: !k[id] }));
      setCursor(n - 1);
    }
  });

  if (editing) {
    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={theme.learn}
        paddingX={1}
      >
        <Text bold color={theme.learnBright}>
          edit title · Enter save · Esc cancel
        </Text>
        <Box>
          <Text color={theme.learnBright} bold>
            ❯{" "}
          </Text>
          <TextInput
            value={draft}
            onChange={setDraft}
            focus
            onSubmit={(v) => {
              const title = v.trim();
              if (title) {
                setItems((arr) =>
                  arr.map((it, i) =>
                    i === cursor ? { ...it, title, slug: it.slug } : it,
                  ),
                );
              }
              setEditing(false);
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.learn}
      paddingX={1}
    >
      <Text bold color={theme.learnBright}>
        ◆ learned — keep as skill?
      </Text>
      <Text color={theme.textDim}>
        Space toggle · ↑↓ · [y] all · [n] skip · [e] edit · Enter confirm
      </Text>
      {items.map((it, i) => {
        const on = kept[it.id];
        const active = i === cursor;
        return (
          <Box key={it.id} flexDirection="column">
            <Text color={active ? theme.learnBright : undefined} bold={active}>
              {active ? "›" : " "} {on ? "◆" : "◇"}{" "}
              <Text color={theme.primary}>[{it.kind}]</Text> {it.title}
            </Text>
            <Text color={theme.textDim}>
              {"   "}why: {it.reason.slice(0, 80)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
