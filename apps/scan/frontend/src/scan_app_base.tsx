import React from 'react';

import { AppBase } from '@votingworks/ui';
import { ColorMode, SizeMode } from '@votingworks/types';

export interface AppBaseProps {
  children: React.ReactNode;
}

const DEFAULT_COLOR_MODE: ColorMode = 'contrastMedium';
const DEFAULT_SIZE__MODE: SizeMode = 'm';

/**
 * Installs global styles and UI themes - should be rendered at the root of the
 * app before anything else.
 */
export function ScanAppBase({ children }: AppBaseProps): JSX.Element {
  return (
    <AppBase
      colorMode={DEFAULT_COLOR_MODE}
      isTouchscreen
      screenType="elo15"
      sizeMode={DEFAULT_SIZE__MODE}
    >
      {children}
    </AppBase>
  );
}
