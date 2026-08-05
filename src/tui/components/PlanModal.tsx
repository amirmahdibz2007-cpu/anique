import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { DeepPlan, PlanDecision } from "../../safety/interaction.js";
import { theme } from "../theme.js";

export function PlanModal(props: {
  plan: DeepPlan;
  onDecide: (d: PlanDecision) => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");

  useInput((input, key) => {
    if (editing) return;
    if (key.escape || input === "n" || input === "N") {
      props.onDecide({ action: "cancel" });
      return;
    }
    if (input === "e" || input === "E") {
      setEditing(true);
      return;
    }
    if (key.return || input === "y" || input === "Y") {
      props.onDecide({ action: "approve" });
    }
  });

  if (editing) {
    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={theme.borderModal}
        paddingX={1}
      >
        <Text bold color={theme.secondaryBright}>
          ✎ edit plan note
        </Text>
        <Text color={theme.textDim}>
          tell the planner what to change · Esc cancel
        </Text>
        <Box>
          <Text color={theme.secondaryBright} bold>
            ❯{" "}
          </Text>
          <TextInput
            value={note}
            onChange={setNote}
            focus
            placeholder="e.g. skip tests, focus on API…"
            onSubmit={(v) => {
              props.onDecide({ action: "edit", note: v.trim() });
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
      borderColor={theme.borderModal}
      paddingX={1}
    >
      <Text bold color={theme.secondaryBright}>
        ◈ deep plan · {props.plan.tasks.length} tasks
      </Text>
      <Text>
        <Text bold color={theme.secondary}>goal: </Text>
        {props.plan.goal}
      </Text>
      <Text bold color={theme.textDim}>done when:</Text>
      {props.plan.done_when.map((d, i) => (
        <Text key={i} color={theme.success}>
          {"  "}✓ {d}
        </Text>
      ))}
      <Text bold color={theme.textDim}>
        tasks:
      </Text>
      {props.plan.tasks.map((t, i) => (
        <Box key={t.id} flexDirection="column">
          <Text>
            {"  "}
            <Text color={theme.primary}>{i + 1}.</Text> {t.title}
            {t.risky ? <Text color={theme.warnBright}> ⚠</Text> : null}
          </Text>
          <Text color={theme.textDim}>
            {"     "}accept: {t.acceptance}
          </Text>
        </Box>
      ))}
      <Text> </Text>
      <Text color={theme.successBright} bold>
        ▸ [y] run
      </Text>
      <Text color={theme.textDim}>
        [e] edit · [n] cancel
      </Text>
    </Box>
  );
}
