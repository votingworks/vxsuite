import React, { useEffect, useMemo } from 'react';
import { ThemeProvider } from 'styled-components';

import { ColorMode, ScreenType, SizeMode, UiTheme } from '@votingworks/types';

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
  screenType?: ScreenType;
  sizeMode?: SizeMode;
}

export interface UiThemeManagerContextInterface {
  setColorMode: (mode: ColorMode) => void;
  setSizeMode: (mode: SizeMode) => void;
}

export const UiThemeManagerContext =
  React.createContext<UiThemeManagerContextInterface>({
    setColorMode: () => undefined,
    setSizeMode: () => undefined,
  });

/**
 * Common app container that sets up global Vx styles.
 */
export function AppBase(props: AppBaseProps): JSX.Element {
  const {
    children,
    colorMode: defaultColorMode = 'legacy',
    enableScroll = false,
    isTouchscreen = false,
    legacyBaseFontSizePx,
    legacyPrintFontSizePx,
    screenType,
    sizeMode: defaultSizeMode = 'legacy',
  } = props;

  const [colorMode, setColorMode] = React.useState<ColorMode>(defaultColorMode);
  const [sizeMode, setSizeMode] = React.useState<SizeMode>(defaultSizeMode);

  const theme = useMemo(
    () => makeTheme({ colorMode, screenType, sizeMode }),
    [colorMode, sizeMode]
  );

  return (
    <UiThemeManagerContext.Provider
      value={{
        setColorMode,
        setSizeMode,
      }}
    >
      <ThemeProvider theme={theme}>
        <GlobalStyles
          enableScroll={enableScroll}
          isTouchscreen={isTouchscreen}
          legacyBaseFontSizePx={legacyBaseFontSizePx}
          legacyPrintFontSizePx={legacyPrintFontSizePx}
        />
        {children}
      </ThemeProvider>
    </UiThemeManagerContext.Provider>
  );
}
