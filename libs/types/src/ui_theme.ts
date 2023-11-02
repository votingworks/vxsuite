/** Supported screen types for VxSuite apps. */
export type ScreenType = 'builtIn' | 'elo13' | 'elo15' | 'lenovoThinkpad15';

/**  VVSG 2.0 compliant color modes used for voter-facing touchscreen apps. */
export const TOUCH_COLOR_MODES = [
  'contrastHighDark',
  'contrastHighLight',
  'contrastMedium',
  'contrastLow',
] as const;

export type TouchColorMode = (typeof TOUCH_COLOR_MODES)[number];

/** Standard color mode for non-voter-facing desktop apps. */
export type DesktopColorMode = 'desktop';

/** Options for supported UI color themes. */
export type ColorMode = DesktopColorMode | TouchColorMode;

export const TOUCH_SIZE_MODES = [
  'touchSmall',
  'touchMedium',
  'touchLarge',
  'touchExtraLarge',
] as const;

/**  VVSG 2.0 compliant size modes used for voter-facing touchscreen apps. */
export type TouchSizeMode = (typeof TOUCH_SIZE_MODES)[number];

/** Standard size mode for non-voter-facing desktop apps. */
export type DesktopSizeMode = 'desktop';

/** Options for supported UI sizing themes. */
export type SizeMode = DesktopSizeMode | TouchSizeMode;

export function isTouchSizeMode(sizeMode: SizeMode): sizeMode is TouchSizeMode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return TOUCH_SIZE_MODES.includes(sizeMode as any);
}

/** VX CSS color definitions. */
export enum Color {
  BLACK = '#000000',
  DANGER_LOW_CONTRAST = '#ff3d3d',
  DANGER_MEDIUM_CONTRAST = '#820b0b',
  GRAY_DARK = '#222222',
  GRAY_LIGHT = '#8a8a8a',
  GRAY_MEDIUM = '#424242',
  OFF_BLACK = '#080808',
  OFF_WHITE = '#fafafa',
  PRIMARY_BLUE_LOW_CONTRAST = '#5b8eb5',
  PRIMARY_BLUE_MEDIUM_CONTRAST = '#00437d',
  PRIMARY_GREEN_LOW_CONTRAST = '#509a52',
  PRIMARY_GREEN_MEDIUM_CONTRAST = '#1c4c19',
  VX_PURPLE_LOW_CONTRAST = '#a977b5',
  VX_PURPLE_MEDIUM_CONTRAST = '#593460',
  WARNING_LOW_CONTRAST = '#bc7c10',
  WARNING_MEDIUM_CONTRAST = '#5c3600',
  WHITE = '#ffffff',
}

export type ColorString = string;

export interface LegacyColorTheme {
  readonly background: ColorString;
  readonly accentDanger: ColorString;
  readonly accentPrimary: ColorString;
  readonly accentSecondary: ColorString;
  readonly accentSuccess: ColorString;
  readonly accentVxPurple: ColorString;
  readonly accentWarning: ColorString;
  readonly foreground: ColorString;
  readonly foregroundDisabled: ColorString;
}

/** CSS color values for various UI features. */
export interface ColorTheme extends LegacyColorTheme {
  readonly background: ColorString;
  readonly onBackground: ColorString;
  readonly onBackgroundMuted: ColorString;

  readonly container: ColorString;
  readonly containerLow: ColorString;
  readonly containerHigh: ColorString;
  readonly outline: ColorString;

  readonly primary: ColorString;
  readonly onPrimary: ColorString;
  readonly primaryContainer: ColorString;

  readonly neutral: ColorString;
  readonly onNeutral: ColorString;

  readonly danger: ColorString;
  readonly onDanger: ColorString;
  readonly dangerContainer: ColorString;

  readonly inverseBackground: ColorString;
  readonly onInverse: ColorString;
  readonly inverseContainer: ColorString;
  readonly inversePrimary: ColorString;

  readonly dangerAccent: ColorString;
  readonly warningAccent: ColorString;
  readonly successAccent: ColorString;
}

/** Pixel size values for various UI element types. */
export interface SizeTheme {
  readonly borderRadiusRem: number;
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
  readonly minTouchAreaSeparationPx: number;
  readonly minTouchAreaSizePx: number;
}

/** UI theme configuration. */
export interface UiTheme {
  readonly colorMode: ColorMode;
  readonly colors: ColorTheme;
  readonly screenType: ScreenType;
  readonly sizeMode: SizeMode;
  readonly sizes: SizeTheme;
}

export type ColorPalette = Record<string, ColorString>;
