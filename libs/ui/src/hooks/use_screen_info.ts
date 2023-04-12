import { useState } from 'react';

/** Data type for {@link useScreenInfo}. */
export interface ScreenInfo {
  readonly isPortrait: boolean;
}

function isScreenPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

/**
 * React hook to get info about the current screen and viewport.
 */
export function useScreenInfo(): ScreenInfo {
  const [screenInfo] = useState<ScreenInfo>({
    isPortrait: isScreenPortrait(),
  });

  // TODO: Add a debounced window resize listener and update screen info accordingly.

  return screenInfo;
}
