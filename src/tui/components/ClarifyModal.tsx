import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type {
  ClarifyAnswer,
  ClarifyQuestion,
} from "../../safety/interaction.js";
import { theme } from "../theme.js";

const OWN = "Type my own answer…";

/**
 * Clarify UI: show real question text + numbered choices + free-type option.
 */
export function ClarifyModal(props: {
  questions: ClarifyQuestion[];
  onDone: (answers: ClarifyAnswer[]) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<ClarifyAnswer[]>([]);
  const [draft, setDraft] = useState("");
  const [typingOwn, setTypingOwn] = useState(false);
  const q = props.questions[idx];

  const choices = q
    ? [...(q.choices?.length ? q.choices : ["Yes", "No"]), OWN].slice(0, 7)
    : [];

  const finish = (all: ClarifyAnswer[]) => props.onDone(all);

  const submitAnswer = (answer: string) => {
    if (!q) return;
    const next = [
      ...answers,
      { id: q.id, answer: answer.trim() || "(skipped)" },
    ];
    if (idx + 1 >= props.questions.length) {
      finish(next);
      return;
    }
    setAnswers(next);
    setIdx(idx + 1);
    setDraft("");
    setTypingOwn(false);
  };

  useInput((input, key) => {
    if (key.escape) {
      if (typingOwn) {
        setTypingOwn(false);
        setDraft("");
        return;
      }
      props.onCancel();
      return;
    }
    if (typingOwn) return;
    if (draft.length > 0) return;
    const n = Number(input);
    if (n >= 1 && n <= choices.length) {
      const picked = choices[n - 1]!;
      if (picked === OWN) {
        setTypingOwn(true);
        return;
      }
      submitAnswer(picked);
    }
  });

  if (!q) {
    return (
      <Box borderStyle="double" borderColor={theme.border} paddingX={1}>
        <Text dimColor>No questions.</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.border}
      paddingX={1}
    >
      <Text bold color={theme.goldBright}>
        ◆ Decision point · {idx + 1}/{props.questions.length}
      </Text>
      <Text dimColor>
        {answers.length > 0 ? `✓ ${answers.length} answer${answers.length === 1 ? "" : "s"} locked · ` : ""}
        Anique will use this decision directly
      </Text>
      <Text bold color={theme.text} wrap="wrap">
        {q.prompt}
      </Text>
      {!typingOwn ? (
        <Box flexDirection="column" marginTop={0}>
          {choices.map((c, i) => (
            <Text key={i} color={c === OWN ? theme.gold : theme.text}>
              {"  "}
              <Text color={theme.goldBright} bold>
                {i + 1})
              </Text>{" "}
              {c}
            </Text>
          ))}
          <Text dimColor>
            Press 1–{choices.length} to pick · Esc cancel
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color={theme.gold}>Type your own answer:</Text>
          <Box>
            <Text color={theme.goldBright} bold>
              ›{" "}
            </Text>
            <TextInput
              value={draft}
              onChange={setDraft}
              onSubmit={(v) => {
                if (!v.trim()) return;
                submitAnswer(v);
              }}
              placeholder="your answer…"
              focus
            />
          </Box>
          <Text dimColor>Enter submit · Esc back to choices</Text>
        </Box>
      )}
    </Box>
  );
}
