import React, { useMemo } from 'react';
import { ThemeProvider } from 'styled-components';

import { ColorMode, SizeMode, UiTheme } from '@votingworks/types';

import { GlobalStyles } from './global_styles';
import { makeTheme } from './themes/make_theme';

declare module 'styled-components' {
  /**
   * Defines the theme type used by styled-components for all clients of this
   * component.
   *
   * See https://styled-components.com/docs/api#create-a-declarations-file
   */
  export interface DefaultTheme extends UiTheme {} // eslint-disable-line @typescript-eslint/no-empty-interface
}

/**
 * Props for {@link AppBase}.
 *
 * TODO: Make colorMode and sizeMode required once themes are ready.
 */
export interface AppBaseProps {
  children: React.ReactNode;
  colorMode?: ColorMode;
  enableScroll?: boolean;
  isTouchscreen?: boolean;
  legacyBaseFontSizePx?: number;
  legacyPrintFontSizePx?: number;
  sizeMode?: SizeMode;
}

/**
 * Common app container that sets up global Vx styles.
 */
export function AppBase(props: AppBaseProps): JSX.Element {
  const {
    children,
    colorMode = 'legacy',
    enableScroll = false,
    isTouchscreen = false,
    legacyBaseFontSizePx,
    legacyPrintFontSizePx,
    sizeMode = 'legacy',
  } = props;

  const theme = useMemo(
    () => makeTheme({ colorMode, sizeMode }),
    [colorMode, sizeMode]
  );

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles
        enableScroll={enableScroll}
        isTouchscreen={isTouchscreen}
        legacyBaseFontSizePx={legacyBaseFontSizePx}
        legacyPrintFontSizePx={legacyPrintFontSizePx}
      />
      {children}
    </ThemeProvider>
  );
}
