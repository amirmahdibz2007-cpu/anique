import { useRef } from "react";
import { useInput } from "ink";

/**
 * Esc once while busy → interrupt callback
 * Esc once while idle → arm double-Esc
 * Esc twice within 800ms → quit
 */
export function useEscEsc(opts: {
  busy: boolean;
  onInterrupt: () => void;
  onQuit: () => void;
  enabled?: boolean;
}): void {
  const lastEsc = useRef(0);

  useInput(
    (_ch, key) => {
      if (!key.escape) return;
      if (opts.busy) {
        opts.onInterrupt();
        lastEsc.current = 0;
        return;
      }
      const now = Date.now();
      if (now - lastEsc.current < 800) {
        opts.onQuit();
        lastEsc.current = 0;
        return;
      }
      lastEsc.current = now;
    },
    { isActive: opts.enabled !== false },
  );
}
