import { useCurrentTheme } from '@votingworks/ui';

/** Returns the current base text size, in pixels, of the HTML document. */
export function useCurrentTextSizePx(): number {
  const currentTheme = useCurrentTheme();
  return currentTheme.sizes.fontDefault;
}
