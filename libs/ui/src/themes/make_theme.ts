import { assert } from '@votingworks/basics';
import {
  Color,
  ColorMode,
  ColorPalette,
  ColorTheme,
  LegacyColorTheme,
  ScreenType,
  SizeMode,
  SizeTheme,
  TouchSizeMode,
  UiTheme,
  isTouchSizeMode,
} from '@votingworks/types';

/**
 * Palette of colors for use on touchscreens. These colors are intended to meet
 * the VVSG contrast requirements for voter-facing apps.
 *
 * Note that not all color combinations are accessible, so you should strongly
 * prefer using the colors assigned to themes below rather than using these
 * color palettes directly. The themes assign colors to roles so that they
 * maintain accessibility when layered.
 */
export const TouchscreenPalette = {
  Gray0: '#ffffff',
  Gray5: '#fafafa',
  Gray50: '#8a8a8a',
  Gray90: '#222222',
  Gray100: '#000000',

  Purple50: '#a977b5',
  Purple80: '#593460',

  Blue50: '#5b8eb5',
  Blue80: '#00437d',

  Orange50: '#bc7c10',
  Orange80: '#5c3600',

  Green50: '#509a52',
  Green80: '#1c4c19',

  Red50: '#ff3d3d',
  Red80: '#820b0b',
} satisfies ColorPalette;

/**
 * Palette of colors for use on desktop screens. These colors are intended to
 * meet the basic WCAG AA contrast requirements, which VVSG requires for
 * non-voter-facing apps.
 *
 * Note that not all color combinations are accessible, so you should strongly
 * prefer using the colors assigned to themes below rather than using these
 * color palettes directly. The themes assign colors to roles so that they
 * maintain accessibility when layered.
 */
export const DesktopPalette = {
  Gray0: 'hsl(262, 14%, 99%)',
  Gray5: 'hsl(262, 10%, 95.30%)',
  Gray10: 'hsl(262, 9%, 90.6%)',
  Gray20: 'hsl(262, 7%, 85.20%)',
  Gray30: 'hsl(262, 6%, 80.40%)',
  Gray40: 'hsl(262, 5%, 68.20%)',
  Gray50: 'hsl(262, 4%, 56.90%)',
  Gray60: 'hsl(262, 3%, 46.30%)',
  Gray70: 'hsl(262, 2%, 36.90%)',
  Gray80: 'hsl(262, 1%, 29.40%)',
  Gray90: 'hsl(262, 0%, 23.90%)',
  Gray95: 'hsl(262, 0%, 15.30%)',
  Gray100: 'hsl(262, 0%, 3.1%)',

  Purple5: 'hsl(262, 80.90%, 97.96%)',
  Purple10: 'hsl(262, 75.90%, 95.63%)',
  Purple20: 'hsl(262, 70.90%, 91.52%)',
  Purple30: 'hsl(262, 65.90%, 85.63%)',
  Purple40: 'hsl(262, 52.90%, 76.66%)',
  Purple50: 'hsl(262, 52.90%, 67.68%)',
  Purple60: 'hsl(262, 52.90%, 59.19%)',
  Purple70: 'hsl(262, 52.90%, 51.05%)',
  Purple80: 'hsl(262, 52.90%, 40.98%)',
  Purple90: 'hsl(262, 52.90%, 33.92%)',
  Purple95: 'hsl(262, 52.90%, 19.19%)',

  Green5: 'hsl(117, 53.50%, 96.61%)',
  Green10: 'hsl(117, 53.50%, 94.37%)',
  Green20: 'hsl(117, 53.50%, 84.05%)',
  Green30: 'hsl(117, 53.50%, 72.18%)',
  Green40: 'hsl(117, 53.50%, 52.74%)',
  Green50: 'hsl(117, 53.50%, 42.41%)',
  Green60: 'hsl(117, 53.50%, 34.50%)',
  Green70: 'hsl(117, 53.50%, 27.58%)',
  Green80: 'hsl(117, 53.50%, 21.97%)',
  Green90: 'hsl(117, 53.50%, 18.14%)',
  Green95: 'hsl(117, 53.50%, 10.20%)',

  Orange5: 'hsl(28, 100%, 96.26%)',
  Orange10: 'hsl(28, 100%, 94.15%)',
  Orange20: 'hsl(28, 100%, 84.17%)',
  Orange30: 'hsl(28, 100%, 72.57%)',
  Orange40: 'hsl(28, 100%, 52.70%)',
  Orange50: 'hsl(28, 100%, 38.5%)',
  Orange60: 'hsl(28, 100%, 34.57%)',
  Orange70: 'hsl(28, 100%, 27.55%)',
  Orange80: 'hsl(28, 100%, 22.00%)',
  Orange90: 'hsl(28, 100%, 18.03%)',
  Orange95: 'hsl(28, 100%, 10.17%)',

  Red5: 'hsl(0, 85.40%, 98.00%)',
  Red10: 'hsl(0, 80.40%, 94.65%)',
  Red20: 'hsl(0, 82.40%, 91.74%)',
  Red30: 'hsl(0, 79.40%, 85.90%)',
  Red40: 'hsl(0, 75.40%, 76.50%)',
  Red50: 'hsl(0, 75.40%, 66.27%)',
  Red60: 'hsl(0, 75.40%, 52.51%)',
  Red70: 'hsl(0, 75.40%, 41.58%)',
  Red80: 'hsl(0, 75.40%, 33.32%)',
  Red90: 'hsl(0, 75.40%, 27.69%)',
  Red95: 'hsl(0, 75.40%, 16.09%)',
} satisfies ColorPalette;

/**
 * Physical text size ranges from the VVSG 2.0 specification, representing the
 * capital letter height in millimeters.
 */
const VVSG_CAPITAL_LETTER_HEIGHTS_MM: Record<
  TouchSizeMode,
  { max: number; min: number }
> = {
  touchSmall: { max: 4.2, min: 3.5 },
  touchMedium: { max: 5.6, min: 4.8 },
  touchLarge: { max: 7.1, min: 6.4 },
  touchExtraLarge: { max: 9.0, min: 8.5 },
};

/**
 * CSS font-size values refer to the full-body height of the font, while VVSG
 * sets font sizes with respect to "cap height" (capital letter height), so we
 * need to convert between the two.
 *
 * This ratio is font-dependent, so we're setting it here based on the
 * font we've adopted across our apps. Assuming cap height is
 * 72.5% of body height.
 *
 * TODO: Need to verify this value - pulled from this article:
 * https://bigelowandholmes.typepad.com/bigelow-holmes/2014/11/whats-the-difference-between-lucida-grande-and-helvetica-neue.html
 */
const CAPITAL_HEIGHT_TO_FULL_FONT_HEIGHT_RATIO = 1 / 0.725;

type TouchscreenColorTheme = Pick<
  ColorTheme,
  | 'background'
  | 'onBackground'
  | 'primary'
  | 'danger'
  | 'successAccent'
  | 'warningAccent'
>;

/**
 * Since touchscreen apps have much more limited color usage (due to strict
 * contrast reqs), we only need to specify a limited set of distinct colors for
 * these themes. These colors play multiple roles in the full color theme as
 * specified in this function.
 *
 */
function expandToFullColorTheme(
  theme: TouchscreenColorTheme
): Omit<ColorTheme, keyof Omit<LegacyColorTheme, 'background'>> {
  return {
    background: theme.background,
    onBackground: theme.onBackground,
    onBackgroundMuted: theme.onBackground,

    container: theme.background,
    containerLow: theme.background,
    containerHigh: theme.background,
    outline: theme.onBackground,

    primary: theme.primary,
    onPrimary: theme.background,
    primaryContainer: theme.background,

    neutral: theme.background,
    onNeutral: theme.onBackground,

    danger: theme.danger,
    onDanger: theme.background,
    dangerContainer: theme.background,

    inverseBackground: theme.onBackground,
    onInverse: theme.background,
    inversePrimary: theme.primary,
    inverseContainer: theme.background,

    warningAccent: theme.warningAccent,
    successAccent: theme.successAccent,
    dangerAccent: theme.danger,
  };
}

export const colorThemes: Record<ColorMode, ColorTheme> = {
  contrastHighLight: {
    accentDanger: Color.BLACK,
    accentPrimary: Color.BLACK,
    accentSecondary: Color.BLACK,
    accentSuccess: Color.BLACK,
    accentVxPurple: Color.BLACK,
    accentWarning: Color.BLACK,
    foreground: Color.BLACK,
    foregroundDisabled: Color.OFF_BLACK,

    ...expandToFullColorTheme({
      background: TouchscreenPalette.Gray0,
      onBackground: TouchscreenPalette.Gray100,
      primary: TouchscreenPalette.Gray100,
      danger: TouchscreenPalette.Gray100,
      warningAccent: TouchscreenPalette.Gray100,
      successAccent: TouchscreenPalette.Gray100,
    }),
  },
  contrastHighDark: {
    accentDanger: Color.WHITE,
    accentPrimary: Color.WHITE,
    accentSecondary: Color.WHITE,
    accentSuccess: Color.WHITE,
    accentVxPurple: Color.WHITE,
    accentWarning: Color.WHITE,
    foreground: Color.WHITE,
    foregroundDisabled: Color.OFF_WHITE,

    ...expandToFullColorTheme({
      background: TouchscreenPalette.Gray100,
      onBackground: TouchscreenPalette.Gray0,
      primary: TouchscreenPalette.Gray0,
      danger: TouchscreenPalette.Gray0,
      warningAccent: TouchscreenPalette.Gray0,
      successAccent: TouchscreenPalette.Gray0,
    }),
  },
  contrastMedium: {
    accentDanger: Color.DANGER_MEDIUM_CONTRAST,
    accentPrimary: Color.PRIMARY_BLUE_MEDIUM_CONTRAST,
    accentSecondary: Color.PRIMARY_GREEN_MEDIUM_CONTRAST,
    accentSuccess: Color.PRIMARY_GREEN_MEDIUM_CONTRAST,
    accentVxPurple: Color.VX_PURPLE_MEDIUM_CONTRAST,
    accentWarning: Color.DANGER_MEDIUM_CONTRAST,
    foreground: Color.GRAY_DARK,
    foregroundDisabled: Color.GRAY_DARK,

    ...expandToFullColorTheme({
      background: TouchscreenPalette.Gray5,
      onBackground: TouchscreenPalette.Gray90,
      primary: TouchscreenPalette.Blue80,
      danger: TouchscreenPalette.Red80,
      warningAccent: TouchscreenPalette.Orange80,
      successAccent: TouchscreenPalette.Green80,
    }),
  },
  contrastLow: {
    accentDanger: Color.DANGER_LOW_CONTRAST,
    accentPrimary: Color.PRIMARY_BLUE_LOW_CONTRAST,
    accentSecondary: Color.PRIMARY_GREEN_LOW_CONTRAST,
    accentSuccess: Color.PRIMARY_GREEN_LOW_CONTRAST,
    accentVxPurple: Color.VX_PURPLE_LOW_CONTRAST,
    accentWarning: Color.WARNING_LOW_CONTRAST,
    foreground: Color.GRAY_LIGHT,
    foregroundDisabled: Color.GRAY_LIGHT,

    ...expandToFullColorTheme({
      background: TouchscreenPalette.Gray90,
      onBackground: TouchscreenPalette.Gray50,
      primary: TouchscreenPalette.Blue50,
      danger: TouchscreenPalette.Red50,
      warningAccent: TouchscreenPalette.Orange50,
      successAccent: TouchscreenPalette.Green50,
    }),
  },

  desktop: {
    accentDanger: Color.DANGER_LOW_CONTRAST,
    accentPrimary: Color.PRIMARY_BLUE_LOW_CONTRAST,
    accentSecondary: Color.PRIMARY_GREEN_LOW_CONTRAST,
    accentSuccess: Color.PRIMARY_GREEN_LOW_CONTRAST,
    accentVxPurple: Color.VX_PURPLE_LOW_CONTRAST,
    accentWarning: Color.WARNING_LOW_CONTRAST,

    foreground: DesktopPalette.Gray100,
    foregroundDisabled: DesktopPalette.Gray70,

    background: DesktopPalette.Gray0,
    onBackground: DesktopPalette.Gray95,
    onBackgroundMuted: DesktopPalette.Gray70,

    container: DesktopPalette.Gray10,
    containerLow: DesktopPalette.Gray5,
    containerHigh: DesktopPalette.Gray20,
    outline: DesktopPalette.Gray50,

    primary: DesktopPalette.Purple80,
    onPrimary: DesktopPalette.Gray0,
    primaryContainer: DesktopPalette.Purple20,

    neutral: DesktopPalette.Gray80,
    onNeutral: DesktopPalette.Gray0,

    danger: DesktopPalette.Red80,
    onDanger: DesktopPalette.Gray0,
    dangerContainer: DesktopPalette.Red10,

    inverseBackground: DesktopPalette.Gray95,
    onInverse: DesktopPalette.Gray0,
    inversePrimary: DesktopPalette.Purple30,
    inverseContainer: DesktopPalette.Gray80,

    warningAccent: DesktopPalette.Orange50,
    successAccent: DesktopPalette.Green60,
    dangerAccent: DesktopPalette.Red60,
  },
};

const INCHES_PER_MM = 1 / 25.4;

/** Standard resolution for web images/measurements: */
const PIXELS_PER_INCH_WEB = 72;

const SCREEN_WIDTH_PIXELS_ELO_15 = 1080;
const SCREEN_WIDTH_INCHES_ELO_15 = 7.62;

const SCREEN_WIDTH_PIXELS_ELO_13 = 1080;
const SCREEN_WIDTH_INCHES_ELO_13 = 6.51;

const SCREEN_WIDTH_PIXELS_THINKPAD_15 = 1920;
const SCREEN_WIDTH_INCHES_THINKPAD_15 = 14.81;

interface SizeThemeParams {
  screenType: ScreenType;
  sizeMode: SizeMode;
}

/** PPI calculation functions by screen type: */
const devicePixelsPerInch: Record<ScreenType, () => number> = {
  builtIn: () => window.devicePixelRatio * PIXELS_PER_INCH_WEB,
  elo13: () => SCREEN_WIDTH_PIXELS_ELO_13 / SCREEN_WIDTH_INCHES_ELO_13,
  elo15: () => SCREEN_WIDTH_PIXELS_ELO_15 / SCREEN_WIDTH_INCHES_ELO_15,
  lenovoThinkpad15: () =>
    SCREEN_WIDTH_PIXELS_THINKPAD_15 / SCREEN_WIDTH_INCHES_THINKPAD_15,
};

function mmToPx(mm: number, screenType: ScreenType): number {
  const pixelsPerInch: number = devicePixelsPerInch[screenType]();

  return mm * INCHES_PER_MM * pixelsPerInch;
}

function getFontSize({ screenType, sizeMode }: SizeThemeParams): number {
  assert(isTouchSizeMode(sizeMode));
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
  desktop: () => ({
    bordersRem: {
      hairline: 0.06,
      thin: 0.09,
      medium: 0.15,
      thick: 0.25,
    },
    fontDefault: 16,
    fontWeight: {
      light: 200,
      regular: 400,
      semiBold: 500,
      bold: 700,
    },
    headingsRem: {
      h1: 1.8,
      h2: 1.5,
      h3: 1.2,
      h4: 1.125,
      h5: 1.075,
      h6: 1,
    },
    letterSpacingEm: 0.01,
    lineHeight: 1.3,
    minTouchAreaSeparationPx: 0, // Not used on desktop
    minTouchAreaSizePx: 0, // Not used on desktop
  }),
  touchSmall: (p) => ({
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
  touchMedium: (p) => ({
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
  touchLarge: (p) => ({
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
  touchExtraLarge: (p) => ({
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
};

/**
 * Returns a UI theme configuration for the given theme options.
 */
export function makeTheme({
  colorMode = 'contrastMedium',
  screenType = 'builtIn',
  sizeMode = 'touchSmall',
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
