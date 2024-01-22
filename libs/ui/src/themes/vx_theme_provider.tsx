import React from 'react';
import { ThemeProvider } from 'styled-components';

import { ColorMode, ScreenType, SizeMode } from '@votingworks/types';

import { makeTheme } from './make_theme';

export interface VxThemeProviderProps {
  children: React.ReactNode;
  colorMode?: ColorMode;
  isVisualModeDisabled?: boolean;
  sizeMode?: SizeMode;
  screenType?: ScreenType;
}

/**
 * Renders the provided child element(s) within the styled-components theme
 * context required by theme-dependent components.
 *
 * If this is a nested provider, any unspecified theme settings will be
 * inherited from the parent theme.
 */
export function VxThemeProvider(props: VxThemeProviderProps): JSX.Element {
  const { children, colorMode, isVisualModeDisabled, sizeMode, screenType } =
    props;

  return (
    <ThemeProvider
      theme={(theme) =>
        makeTheme({
          colorMode: colorMode || theme?.colorMode,
          sizeMode: sizeMode || theme?.sizeMode,
          screenType: screenType || theme?.screenType,
          isVisualModeDisabled:
            isVisualModeDisabled || theme?.isVisualModeDisabled,
        })
      }
    >
      {children}
    </ThemeProvider>
  );
}
