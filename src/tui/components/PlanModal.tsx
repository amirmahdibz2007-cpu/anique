import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { DeepPlan, PlanDecision } from "../../safety/interaction.js";

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
        borderColor="magenta"
        paddingX={1}
      >
        <Text bold color="magenta">
          Edit plan note
        </Text>
        <Text dimColor>
          Tell the planner what to change, then Enter. Esc cancels edit.
        </Text>
        <Box>
          <Text color="magenta" bold>
            ›{" "}
          </Text>
          <TextInput
            value={note}
            onChange={setNote}
            focus
            placeholder="e.g. skip tests, focus on API only…"
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
      borderColor="magenta"
      paddingX={1}
    >
      <Text bold color="magenta">
        ◆ Deep plan — review before run
      </Text>
      <Text>
        <Text bold>Goal: </Text>
        {props.plan.goal}
      </Text>
      <Text bold>Done when:</Text>
      {props.plan.done_when.map((d, i) => (
        <Text key={i} dimColor>
          {"  "}✓ {d}
        </Text>
      ))}
      <Text bold>
        Tasks ({props.plan.tasks.length}):
      </Text>
      {props.plan.tasks.map((t, i) => (
        <Box key={t.id} flexDirection="column">
          <Text>
            {"  "}
            <Text color="magenta">{i + 1}.</Text> {t.title}
            {t.risky ? <Text color="yellow"> ⚠</Text> : null}
          </Text>
          <Text dimColor>
            {"     "}accept: {t.acceptance}
          </Text>
        </Box>
      ))}
      <Text dimColor>
        [y] run · [e] edit note · [n] cancel
      </Text>
    </Box>
  );
}
