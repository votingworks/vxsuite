import React, { useCallback } from 'react';

import { ColorMode, ScreenType, SizeMode, UiTheme } from '@votingworks/types';

import { GlobalStyles } from './global_styles';
import { VoterSettingsManagerContext } from './voter_settings_manager_context';
import { VxThemeProvider } from './themes/vx_theme_provider';
import { loadFonts, unloadFonts } from './fonts/load_fonts';

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
 */
export interface AppBaseProps {
  children: React.ReactNode;
  defaultColorMode: ColorMode;
  defaultSizeMode: SizeMode;
  defaultIsVisualModeDisabled?: boolean;
  disableFontsForTests?: boolean;
  hideCursor?: boolean;
  showScrollBars?: boolean;
  screenType?: ScreenType;
}

/**
 * Common app container that sets up global Vx styles.
 */
export function AppBase(props: AppBaseProps): JSX.Element {
  const {
    children,
    defaultColorMode,
    defaultSizeMode,
    defaultIsVisualModeDisabled = false,
    disableFontsForTests,
    hideCursor,
    showScrollBars = false,
    screenType = 'builtIn',
  } = props;

  const [colorMode, setColorMode] = React.useState<ColorMode>(defaultColorMode);
  const [sizeMode, setSizeMode] = React.useState<SizeMode>(defaultSizeMode);
  const [isVisualModeDisabled, setIsVisualModeDisabled] =
    React.useState<boolean>(defaultIsVisualModeDisabled);
  const [fontsLoaded, setFontsLoaded] = React.useState(false);

  React.useEffect(() => {
    /* istanbul ignore next - tested via integration tests. */
    if (!disableFontsForTests) {
      loadFonts();
    }

    setFontsLoaded(true);

    // In practice, AppBase is rendered once at the root of each app and never
    // unloaded throughout the lifetime of the app, but in development, React
    // runs an extra render/cleanup cycle, causing `loadFonts` to run twice.
    // This cleanup ensures that we only install one instance of the fonts.
    // https://react.dev/reference/react/useEffect#caveats
    return () => unloadFonts();
  }, [disableFontsForTests]);

  const resetThemes = useCallback(() => {
    setColorMode(defaultColorMode);
    setSizeMode(defaultSizeMode);
    setIsVisualModeDisabled(defaultIsVisualModeDisabled);
  }, [defaultColorMode, defaultSizeMode, defaultIsVisualModeDisabled]);

  if (!fontsLoaded) {
    // To avoid the possibility of font flicker before the fonts are loaded,
    // we render a blank page in the initial render. This only lasts a
    // split-second, so a flicker of loading animation would be jarring.
    return <div />;
  }

  return (
    <VoterSettingsManagerContext.Provider
      value={{
        resetThemes,
        setColorMode,
        setSizeMode,
        setIsVisualModeDisabled,
      }}
    >
      <VxThemeProvider
        colorMode={colorMode}
        screenType={screenType}
        sizeMode={sizeMode}
        isVisualModeDisabled={isVisualModeDisabled}
      >
        <GlobalStyles hideCursor={hideCursor} showScrollBars={showScrollBars} />
        {children}
      </VxThemeProvider>
    </VoterSettingsManagerContext.Provider>
  );
}
