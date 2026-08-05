import React from "react";
import { Box, Text } from "ink";
import { theme, AURORA } from "../theme.js";
import { GradientBlock } from "../widgets.js";
import { useSpinner } from "../hooks/useSpinner.js";

/** Big wordmark — figlet "ANSI Shadow", 47 cols wide. Shown on wide terminals. */
const LOGO_BIG = [
  " █████╗ ███╗   ██╗██╗ ██████╗ ██╗   ██╗███████╗",
  "██╔══██╗████╗  ██║██║██╔═══██╗██║   ██║██╔════╝",
  "███████║██╔██╗ ██║██║██║   ██║██║   ██║█████╗  ",
  "██╔══██║██║╚██╗██║██║██║▄▄ ██║██║   ██║██╔══╝  ",
  "██║  ██║██║ ╚████║██║╚██████╔╝╚██████╔╝███████╗",
  "╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝",
];

/** Compact wordmark — figlet "Small Slant", 27 cols wide. Shown on narrow terminals. */
const LOGO_SMALL = [
  "            _              ",
  " ___ ____  (_)__ ___ _____ ",
  "/ _ `/ _ \\/ / _ `/ // / -_)",
  "\\_,_/_//_/_/\\_, /\\_,_/\\__/ ",
  "             /_/           ",
];

const TAGLINE = "your terminal · your memory · your daily driver";

export function Splash(props: { cols: number; rows: number }): React.ReactElement {
  const spin = useSpinner(true);
  const wide = props.cols >= 58;
  const logo = wide ? LOGO_BIG : LOGO_SMALL;
  const ruleW = Math.min(props.cols - 4, wide ? 47 : 28);

  return (
    <Box
      flexDirection="column"
      width={props.cols}
      height={props.rows}
      alignItems="center"
      justifyContent="center"
    >
      <GradientBlock lines={logo} colors={AURORA} bold />
      <Box marginTop={1}>
        <Text>
          {"─".repeat(Math.max(4, Math.floor((ruleW - 2) / 2)))}
          <Text color={theme.secondaryBright}> ◆ </Text>
          {"─".repeat(Math.max(4, Math.ceil((ruleW - 2) / 2)))}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.textDim}>{TAGLINE}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.faint}>
          {spin} waking up
        </Text>
      </Box>
    </Box>
  );
}
