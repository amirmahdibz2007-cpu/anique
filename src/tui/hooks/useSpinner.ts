import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Animated braille spinner. Frozen (returns the first frame) when `active`
 * is false, so idle renders stay stable and don't cause re-render churn.
 */
export function useSpinner(active: boolean, intervalMs = 80): string {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  return FRAMES[frame]!;
}
