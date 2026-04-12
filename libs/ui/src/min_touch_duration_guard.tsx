import React, { useRef } from 'react';

/**
 * Default identified through empirical testing, specifically ESD testing on VxMarkScan
 */
export const DEFAULT_MIN_TOUCH_DURATION_MS = 50;

interface MinTouchDurationGuardProps {
  children: React.ReactNode;
  minTouchDurationMs?: number;
  style?: React.CSSProperties;
}

/**
 * Wraps children and blocks click events from touches shorter than {@link minTouchDurationMs}.
 * Useful for filtering out electrostatic discharge (ESD) events that manifest as very brief
 * touches.
 *
 * Uses capture-phase event handlers so that short touches are intercepted before reaching any
 * button's click handler.
 */
export function MinTouchDurationGuard({
  children,
  minTouchDurationMs = DEFAULT_MIN_TOUCH_DURATION_MS,
  style,
}: MinTouchDurationGuardProps): JSX.Element {
  const pointerDownTime = useRef<number>();

  return (
    <div
      onPointerDownCapture={() => {
        pointerDownTime.current = Date.now();
      }}
      onClickCapture={(e) => {
        if (pointerDownTime.current === undefined) {
          return;
        }
        const touchDurationMs = Date.now() - pointerDownTime.current;
        pointerDownTime.current = undefined;
        const touchShouldRegister = touchDurationMs >= minTouchDurationMs;
        if (!touchShouldRegister) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      style={style}
    >
      {children}
    </div>
  );
}
