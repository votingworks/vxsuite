import React, { useCallback } from 'react';

import { ColorMode, ScreenType, SizeMode, UiTheme } from '@votingworks/types';

import { GlobalStyles } from './global_styles';
import { ThemeManagerContext } from './theme_manager_context';
import { VxThemeProvider } from './themes/vx_theme_provider';
import { loadFonts } from './fonts/load_fonts';

declare module 'styled-components' {
  /**
   * Defines the theme type used by styled-components for all clients of this
   * component.
   *
   * See https://styled-components.com/docs/api#create-a-declarations-file
   */
  export interface DefaultTheme extends UiTheme {}
}

/**
 * Props for {@link AppBase}.
 *
 * TODO: Make colorMode and sizeMode required once themes are ready.
 */
export interface AppBaseProps {
  children: React.ReactNode;
  defaultColorMode?: ColorMode;
  defaultSizeMode?: SizeMode;
  disableFontsForTests?: boolean;
  enableScroll?: boolean;
  isTouchscreen?: boolean;
  legacyBaseFontSizePx?: number;
  legacyPrintFontSizePx?: number;
  screenType?: ScreenType;
}

/**
 * Common app container that sets up global Vx styles.
 */
export function AppBase(props: AppBaseProps): JSX.Element {
  const {
    children,
    defaultColorMode = 'legacy',
    defaultSizeMode = 'legacy',
    disableFontsForTests,
    enableScroll = false,
    isTouchscreen = false,
    legacyBaseFontSizePx,
    legacyPrintFontSizePx,
    screenType = 'builtIn',
  } = props;

  const [colorMode, setColorMode] = React.useState<ColorMode>(defaultColorMode);
  const [sizeMode, setSizeMode] = React.useState<SizeMode>(defaultSizeMode);

  React.useEffect(() => {
    /* istanbul ignore next - tested via integration tests. */
    if (!disableFontsForTests) {
      loadFonts();
    }
  }, [disableFontsForTests]);

  const resetThemes = useCallback(() => {
    setColorMode(defaultColorMode);
    setSizeMode(defaultSizeMode);
  }, [defaultColorMode, defaultSizeMode]);

  return (
    <ThemeManagerContext.Provider
      value={{
        resetThemes,
        setColorMode,
        setSizeMode,
      }}
    >
      <VxThemeProvider
        colorMode={colorMode}
        screenType={screenType}
        sizeMode={sizeMode}
      >
        <GlobalStyles
          enableScroll={enableScroll}
          isTouchscreen={isTouchscreen}
          legacyBaseFontSizePx={legacyBaseFontSizePx}
          legacyPrintFontSizePx={legacyPrintFontSizePx}
        />
        {children}
      </VxThemeProvider>
    </ThemeManagerContext.Provider>
  );
}
