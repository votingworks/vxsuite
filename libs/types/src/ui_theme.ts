/** Options for supported UI color themes. */
export type ColorMode =
  | 'contrastHighDark'
  | 'contrastHighLight'
  | 'contrastMedium'
  | 'contrastLow'
  | 'legacy';

/** Options for supported UI sizing themes. */
export type SizeMode = 's' | 'm' | 'l' | 'xl' | 'legacy';

/** VX CSS color definitions. */
export enum Color {
  BLACK = '#000000',
  DANGER_LOW_CONTRAST = '#ff3d3d',
  DANGER_MEDIUM_CONTRAST = '#820b0b',
  GRAY_DARK = '#222222',
  GRAY_LIGHT = '#8a8a8a',
  GRAY_MEDIUM = '#5c5c5c',
  OFF_BLACK = '#080808',
  OFF_WHITE = '#fafafa',
  PRIMARY_BLUE_LOW_CONTRAST = '#5b8eb5',
  PRIMARY_BLUE_MEDIUM_CONTRAST = '#0f426a',
  PRIMARY_GREEN_LOW_CONTRAST = '#509a52',
  PRIMARY_GREEN_MEDIUM_CONTRAST = '#174915',
  WARNING_LOW_CONTRAST = '#bc7c10',
  WARNING_MEDIUM_CONTRAST = '#5c3600',
  WHITE = '#ffffff',

  LEGACY_ACCENT_DANGER = '#ff0000',
  LEGACY_ACCENT_WARNING = '#ff8c00',
  LEGACY_BACKGROUND = '#edeff0',
  LEGACY_FOREGROUND = '#263238',
  LEGACY_FOREGROUND_DISABLED = '#999999',
  LEGACY_PRIMARY_BLUE = '#2298de',
  LEGACY_PRIMARY_GREEN = '#47a74b',
}

/** CSS color values for various UI features. */
export interface ColorTheme {
  readonly accentDanger: Color;
  readonly accentPrimary: Color;
  readonly accentSecondary: Color;
  readonly accentSuccess: Color;
  readonly accentWarning: Color;
  readonly background: Color;
  readonly foreground: Color;
  readonly foregroundDisabled: Color;
}

/** Pixel size values for various UI element types. */
export interface SizeTheme {
  readonly bordersRem: {
    readonly hairline: number;
    readonly medium: number;
    readonly thick: number;
    readonly thin: number;
  };
  readonly fontDefault: number;
  readonly fontWeight: {
    readonly bold: number;
    readonly light: number;
    readonly regular: number;
    readonly semiBold: number;
  };
  readonly headingsRem: {
    readonly h1: number;
    readonly h2: number;
    readonly h3: number;
    readonly h4: number;
    readonly h5: number;
    readonly h6: number;
  };
  readonly letterSpacingEm: number;
  readonly lineHeight: number;
}

/** UI theme configuration. */
export interface UiTheme {
  readonly colorMode: ColorMode;
  readonly colors: ColorTheme;
  readonly sizeMode: SizeMode;
  readonly sizes: SizeTheme;
}
