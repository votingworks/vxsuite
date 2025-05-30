import React from 'react';

import { AppBase } from '@votingworks/ui';
import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

export interface AppBaseProps {
  children: React.ReactNode;
}

const DEFAULT_COLOR_MODE: ColorMode = 'contrastMedium';
const DEFAULT_SCREEN_TYPE: ScreenType = 'elo15';
const DEFAULT_SIZE_MODE: SizeMode = 'touchMedium';

/**
 * Installs global styles and UI themes - should be rendered at the root of the
 * app before anything else.
 */
export function MarkScanAppBase({ children }: AppBaseProps): JSX.Element {
  return (
    <AppBase
      defaultColorMode={DEFAULT_COLOR_MODE}
      defaultSizeMode={DEFAULT_SIZE_MODE}
      hideCursor={isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.HIDE_CURSOR
      )}
      screenType={DEFAULT_SCREEN_TYPE}
    >
      {children}
    </AppBase>
  );
}
