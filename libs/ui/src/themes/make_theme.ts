import {
  Color,
  ColorMode,
  ColorTheme,
  ScreenType,
  SizeMode,
  SizeTheme,
  UiTheme,
} from '@votingworks/types';

/**
 * Physical text size ranges from the VVSG 2.0 specification, representing the
 * capital letter height in millimeters.
 */
const VVSG_CAPITAL_LETTER_HEIGHTS_MM: Record<
  SizeMode,
  { max: number; min: number }
> = {
  s: { max: 4.2, min: 3.5 },
  m: { max: 5.6, min: 4.8 },
  l: { max: 7.1, min: 6.4 },
  xl: { max: 9.0, min: 8.5 },
  legacy: { max: 0, min: 0 }, // unused
};

/**
 * CSS font-size values refer to the full-body height of the font, while VVSG
 * sets font sizes with respect to "cap height" (capital letter height), so we
 * need to convert between the two.
 *
 * This ratio is font-dependent, so we're setting it here based on the
 * Helvetica Neue font we've adopted across our apps. Assuming cap height is
 * 72.5% of body height.
 *
 * TODO: Need to verify this value - pulled from this article:
 * https://bigelowandholmes.typepad.com/bigelow-holmes/2014/11/whats-the-difference-between-lucida-grande-and-helvetica-neue.html
 */
const CAPITAL_HEIGHT_TO_FULL_FONT_HEIGHT_RATIO = 1 / 0.725;

const colorThemes: Record<ColorMode, ColorTheme> = {
  contrastHighLight: {
    accentDanger: Color.BLACK,
    accentPrimary: Color.BLACK,
    accentSecondary: Color.BLACK,
    accentSuccess: Color.BLACK,
    accentVxPurple: Color.BLACK,
    accentWarning: Color.BLACK,
    background: Color.WHITE,
    foreground: Color.BLACK,
    foregroundDisabled: Color.OFF_BLACK,
  },
  contrastHighDark: {
    accentDanger: Color.WHITE,
    accentPrimary: Color.WHITE,
    accentSecondary: Color.WHITE,
    accentSuccess: Color.WHITE,
    accentVxPurple: Color.WHITE,
    accentWarning: Color.WHITE,
    background: Color.BLACK,
    foreground: Color.WHITE,
    foregroundDisabled: Color.OFF_WHITE,
  },
  contrastMedium: {
    accentDanger: Color.DANGER_MEDIUM_CONTRAST,
    accentPrimary: Color.PRIMARY_BLUE_MEDIUM_CONTRAST,
    accentSecondary: Color.PRIMARY_GREEN_MEDIUM_CONTRAST,
    accentSuccess: Color.PRIMARY_GREEN_MEDIUM_CONTRAST,
    accentVxPurple: Color.VX_PURPLE_MEDIUM_CONTRAST,
    accentWarning: Color.GRAY_DARK,
    background: Color.OFF_WHITE,
    foreground: Color.GRAY_DARK,
    foregroundDisabled: Color.GRAY_DARK,
  },
  contrastLow: {
    accentDanger: Color.DANGER_LOW_CONTRAST,
    accentPrimary: Color.PRIMARY_BLUE_LOW_CONTRAST,
    accentSecondary: Color.PRIMARY_GREEN_LOW_CONTRAST,
    accentSuccess: Color.PRIMARY_GREEN_LOW_CONTRAST,
    accentVxPurple: Color.VX_PURPLE_LOW_CONTRAST,
    accentWarning: Color.WARNING_LOW_CONTRAST,
    background: Color.GRAY_DARK,
    foreground: Color.GRAY_LIGHT,
    foregroundDisabled: Color.GRAY_LIGHT,
  },

  legacy: {
    background: Color.LEGACY_BACKGROUND,
    foreground: Color.LEGACY_FOREGROUND,
    foregroundDisabled: Color.LEGACY_FOREGROUND_DISABLED,
    accentPrimary: Color.LEGACY_PRIMARY_GREEN,
    accentSecondary: Color.LEGACY_PRIMARY_BLUE,
    accentSuccess: Color.LEGACY_PRIMARY_GREEN,
    accentDanger: Color.LEGACY_ACCENT_DANGER,
    accentVxPurple: Color.VX_PURPLE_LOW_CONTRAST,
    accentWarning: Color.LEGACY_ACCENT_WARNING,
  },
};

const INCHES_PER_MM = 1 / 25.4;

/** Standard resolution for web images/measurements: */
const PIXELS_PER_INCH_WEB = 72;

const SCREEN_WIDTH_PIXELS_ELO_15 = 1080;
const SCREEN_WIDTH_INCHES_ELO_15 = 7.62;

const SCREEN_WIDTH_PIXELS_ELO_13 = 1080;
const SCREEN_WIDTH_INCHES_ELO_13 = 6.51;

const SCREEN_WIDTH_PIXELS_LENOVO = 1920;
const SCREEN_WIDTH_INCHES_LENOVO = 14.81;

interface SizeThemeParams {
  screenType: ScreenType;
  sizeMode: SizeMode;
}

/** PPI calculation functions by screen type: */
const devicePixelsPerInch: Record<ScreenType, () => number> = {
  builtIn: () => window.devicePixelRatio * PIXELS_PER_INCH_WEB,
  elo13: () => SCREEN_WIDTH_PIXELS_ELO_13 / SCREEN_WIDTH_INCHES_ELO_13,
  elo15: () => SCREEN_WIDTH_PIXELS_ELO_15 / SCREEN_WIDTH_INCHES_ELO_15,
  lenovo: () => SCREEN_WIDTH_PIXELS_LENOVO / SCREEN_WIDTH_INCHES_LENOVO,
};

function mmToPx(mm: number, screenType: ScreenType): number {
  const pixelsPerInch: number = devicePixelsPerInch[screenType]();

  return mm * INCHES_PER_MM * pixelsPerInch;
}

function getFontSize({ screenType, sizeMode }: SizeThemeParams): number {
  // Use the average midpoint value of the relevant VVSG size range.
  const capitalLetterHeightMm =
    (VVSG_CAPITAL_LETTER_HEIGHTS_MM[sizeMode].min +
      VVSG_CAPITAL_LETTER_HEIGHTS_MM[sizeMode].max) /
    2;

  const fullFontHeightMm =
    capitalLetterHeightMm * CAPITAL_HEIGHT_TO_FULL_FONT_HEIGHT_RATIO;

  return mmToPx(fullFontHeightMm, screenType);
}

const VVSG_MIN_TOUCH_AREA_SIZE_MM = 12.7;

const VVSG_MIN_TOUCH_AREA_SEPARATION_MM = 2.54;

const sizeThemes: Record<SizeMode, (p: SizeThemeParams) => SizeTheme> = {
  s: (p) => ({
    bordersRem: {
      hairline: 0.06,
      thin: 0.1,
      medium: 0.15,
      thick: 0.25,
    },
    fontDefault: getFontSize(p),
    fontWeight: {
      bold: 600,
      light: 200,
      regular: 300,
      semiBold: 500,
    },
    headingsRem: {
      h1: 2.25,
      h2: 1.75,
      h3: 1.5,
      h4: 1.25,
      h5: 1.125,
      h6: 1,
    },
    letterSpacingEm: 0.01,
    lineHeight: 1.3,
    minTouchAreaSeparationPx: mmToPx(
      VVSG_MIN_TOUCH_AREA_SEPARATION_MM,
      p.screenType
    ),
    minTouchAreaSizePx: mmToPx(VVSG_MIN_TOUCH_AREA_SIZE_MM, p.screenType),
  }),
  m: (p) => ({
    bordersRem: {
      hairline: 0.055,
      thin: 0.1,
      medium: 0.15,
      thick: 0.25,
    },
    fontDefault: getFontSize(p),
    fontWeight: {
      bold: 600,
      light: 200,
      regular: 300,
      semiBold: 500,
    },
    headingsRem: {
      h1: 2.125,
      h2: 1.75,
      h3: 1.5,
      h4: 1.25,
      h5: 1.125,
      h6: 1,
    },
    letterSpacingEm: 0.01,
    lineHeight: 1.15,
    minTouchAreaSeparationPx: mmToPx(
      VVSG_MIN_TOUCH_AREA_SEPARATION_MM,
      p.screenType
    ),
    minTouchAreaSizePx: mmToPx(VVSG_MIN_TOUCH_AREA_SIZE_MM, p.screenType),
  }),
  l: (p) => ({
    bordersRem: {
      hairline: 0.05,
      thin: 0.1,
      medium: 0.15,
      thick: 0.2,
    },
    fontDefault: getFontSize(p),
    fontWeight: {
      bold: 600,
      light: 200,
      regular: 300,
      semiBold: 400,
    },
    headingsRem: {
      h1: 1.8,
      h2: 1.5,
      h3: 1.3,
      h4: 1.2,
      h5: 1.1,
      h6: 1,
    },
    letterSpacingEm: 0.005,
    lineHeight: 1.1,
    minTouchAreaSeparationPx: mmToPx(
      VVSG_MIN_TOUCH_AREA_SEPARATION_MM,
      p.screenType
    ),
    minTouchAreaSizePx: mmToPx(VVSG_MIN_TOUCH_AREA_SIZE_MM, p.screenType),
  }),
  xl: (p) => ({
    bordersRem: {
      hairline: 0.05,
      thin: 0.075,
      medium: 0.125,
      thick: 0.15,
    },
    fontDefault: getFontSize(p),
    fontWeight: {
      bold: 600,
      light: 200,
      regular: 300,
      semiBold: 400,
    },
    headingsRem: {
      h1: 1.4,
      h2: 1.25,
      h3: 1.2,
      h4: 1.15,
      h5: 1.1,
      h6: 1,
    },
    letterSpacingEm: 0.005,
    lineHeight: 1.1,
    minTouchAreaSeparationPx: mmToPx(
      VVSG_MIN_TOUCH_AREA_SEPARATION_MM,
      p.screenType
    ),
    minTouchAreaSizePx: mmToPx(VVSG_MIN_TOUCH_AREA_SIZE_MM, p.screenType),
  }),

  legacy: (p) => ({
    bordersRem: {
      hairline: 0.05,
      thin: 0.1,
      medium: 0.15,
      thick: 0.25,
    },
    fontDefault: 16,
    fontWeight: {
      bold: 600,
      light: 300,
      regular: 400,
      semiBold: 500,
    },
    headingsRem: {
      h1: 1.5,
      h2: 1.25,
      h3: 1.17,
      h4: 1,
      h5: 0.9,
      h6: 0.9,
    },
    letterSpacingEm: 0, // Browser default.
    lineHeight: 1.2,
    minTouchAreaSeparationPx: mmToPx(
      VVSG_MIN_TOUCH_AREA_SEPARATION_MM,
      p.screenType
    ),
    minTouchAreaSizePx: 0,
  }),
};

/**
 * Returns a UI theme configuration for the given theme options.
 */
export function makeTheme({
  colorMode = 'legacy',
  screenType = 'builtIn',
  sizeMode = 'legacy',
}: {
  colorMode?: ColorMode;
  screenType?: ScreenType;
  sizeMode?: SizeMode;
}): UiTheme {
  return {
    colorMode,
    colors: colorThemes[colorMode],
    screenType,
    sizeMode,
    sizes: sizeThemes[sizeMode]({ screenType, sizeMode }),
  };
}
