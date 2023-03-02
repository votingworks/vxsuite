import React from 'react';

import { AppBase } from '@votingworks/ui';

export interface AppBaseProps {
  children: React.ReactNode;
}

// Copied from old App.css
const BASE_FONT_SIZE_PX = 28;

// TODO: Default to high contrast and vary based on user selection.
const DEFAULT_COLOR_MODE = 'legacy';

/**
 * Installs global styles and UI themes - should be rendered at the root of the
 * app before anything else.
 */
export function ScanAppBase({ children }: AppBaseProps): JSX.Element {
  return (
    <AppBase
      colorMode={DEFAULT_COLOR_MODE}
      isTouchscreen
      legacyBaseFontSizePx={BASE_FONT_SIZE_PX}
    >
      {children}
    </AppBase>
  );
}
