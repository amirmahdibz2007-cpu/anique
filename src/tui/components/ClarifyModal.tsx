import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type {
  ClarifyAnswer,
  ClarifyQuestion,
} from "../../safety/interaction.js";
import { theme } from "../theme.js";

const OWN = "Type my own…";

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
      <Box borderStyle="round" borderColor={theme.borderDim} paddingX={1}>
        <Text color={theme.textDim}>no questions.</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={theme.borderModal}
      paddingX={1}
    >
      <Text bold color={theme.secondaryBright}>
        ✧ clarify · {idx + 1}/{props.questions.length}
      </Text>
      <Text color={theme.textDim}>
        {answers.length > 0 ? `✓ ${answers.length} answered · ` : ""}
        answering helps Anique give better results
      </Text>
      <Text bold color={theme.text} wrap="wrap">
        {q.prompt}
      </Text>
      {!typingOwn ? (
        <Box flexDirection="column" marginTop={0}>
          {choices.map((c, i) => (
            <Text key={i} color={c === OWN ? theme.secondary : theme.text}>
              {"  "}
              <Text color={theme.secondaryBright} bold>
                {i + 1})
              </Text>{" "}
              {c}
            </Text>
          ))}
          <Text color={theme.textDim}>
            1–{choices.length} pick · Esc cancel
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color={theme.secondary}>your answer:</Text>
          <Box>
            <Text color={theme.secondaryBright} bold>
              ❯{" "}
            </Text>
            <TextInput
              value={draft}
              onChange={setDraft}
              onSubmit={(v) => {
                if (!v.trim()) return;
                submitAnswer(v);
              }}
              placeholder="type here…"
              focus
            />
          </Box>
          <Text color={theme.textDim}>Enter submit · Esc back</Text>
        </Box>
      )}
    </Box>
  );
}
