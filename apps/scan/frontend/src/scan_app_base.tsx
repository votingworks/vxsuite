import React from 'react';

import { AppBase } from '@votingworks/ui';
import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';

export interface AppBaseProps {
  children: React.ReactNode;
}

const DEFAULT_COLOR_MODE: ColorMode = 'contrastMedium';
const DEFAULT_SCREEN_TYPE: ScreenType = 'elo15';
const DEFAULT_SIZE_MODE: SizeMode = 'm';

/**
 * Installs global styles and UI themes - should be rendered at the root of the
 * app before anything else.
 */
export function ScanAppBase({ children }: AppBaseProps): JSX.Element {
  return (
    <AppBase
      colorMode={DEFAULT_COLOR_MODE}
      isTouchscreen
      screenType={DEFAULT_SCREEN_TYPE}
      sizeMode={DEFAULT_SIZE_MODE}
    >
      {children}
    </AppBase>
  );
}
