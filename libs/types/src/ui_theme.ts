/** Options for supported UI color themes. */
export type ColorMode =
  | 'contrastHighDark'
  | 'contrastHighLight'
  | 'contrastMedium'
  | 'legacy';

/** Options for supported UI sizing themes. */
export type SizeMode = 's' | 'm' | 'l' | 'xl' | 'legacy';

/** VX CSS color definitions. */
export enum Color {
  BLACK = '#000000',
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
  readonly fontDefault: number;
  readonly fontWeight: {
    readonly bold: number;
    readonly light: number;
    readonly regular: number;
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
  // TODO: Flesh out
}

/** UI theme configuration. */
export interface UiTheme {
  readonly colorMode: ColorMode;
  readonly colors: ColorTheme;
  readonly sizeMode: SizeMode;
  readonly sizes: SizeTheme;
}
