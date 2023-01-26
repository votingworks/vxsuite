import {
  Color,
  ColorMode,
  ColorTheme,
  SizeMode,
  SizeTheme,
  UiTheme,
} from '@votingworks/types';

const COLOR_THEME_LEGACY: ColorTheme = {
  background: Color.LEGACY_BACKGROUND,
  foreground: Color.LEGACY_FOREGROUND,
  foregroundDisabled: Color.LEGACY_FOREGROUND_DISABLED,
  accentPrimary: Color.LEGACY_PRIMARY_GREEN,
  accentSecondary: Color.LEGACY_PRIMARY_BLUE,
  accentDanger: Color.LEGACY_ACCENT_DANGER,
  accentWarning: Color.LEGACY_ACCENT_WARNING,
};

// TODO: Actually implement these themes:
const colorThemes: Record<ColorMode, ColorTheme> = {
  contrastHighLight: {
    ...COLOR_THEME_LEGACY,
    background: Color.WHITE,
    foreground: Color.BLACK,
  },
  contrastHighDark: {
    ...COLOR_THEME_LEGACY,
    background: Color.BLACK,
    foreground: Color.WHITE,
  },
  contrastMedium: COLOR_THEME_LEGACY,

  legacy: COLOR_THEME_LEGACY,
};

// TODO: Actually implement these themes:
const sizeThemes: Record<SizeMode, SizeTheme> = {
  s: { fontDefault: 10 },
  m: { fontDefault: 14 },
  l: { fontDefault: 18 },
  xl: { fontDefault: 24 },

  legacy: { fontDefault: 16 },
};

/**
 * Returns a UI theme configuration for the given theme options.
 */
export function makeTheme({
  colorMode = 'legacy',
  sizeMode = 'legacy',
}: {
  colorMode?: ColorMode;
  sizeMode?: SizeMode;
}): UiTheme {
  return {
    colorMode,
    colors: colorThemes[colorMode],
    sizeMode,
    sizes: sizeThemes[sizeMode],
  };
}
