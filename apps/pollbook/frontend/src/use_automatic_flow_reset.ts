import { useEffect, useRef } from 'react';
import { AUTOMATIC_FLOW_STATE_RESET_DELAY_MS } from './globals.js';

/** Calls `onReset` after a delay while `isActive`; cancelled on deactivation or unmount. */
export function useAutomaticFlowReset(
  isActive: boolean,
  onReset: () => void
): void {
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  useEffect(() => {
    if (!isActive) return;
    const timeoutId = setTimeout(
      () => onResetRef.current(),
      AUTOMATIC_FLOW_STATE_RESET_DELAY_MS
    );
    return () => clearTimeout(timeoutId);
  }, [isActive]);
}
