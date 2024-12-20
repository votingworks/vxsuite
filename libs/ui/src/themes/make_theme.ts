import { assert } from '@votingworks/basics';
import {
  ColorMode,
  ColorPalette,
  ColorTheme,
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

  Purple50: '#b591f3',
  Purple80: '#4d2692',

  Orange50: '#ec791e',
  Orange80: '#5c3600',

  Green50: '#509a52',
  Green80: '#194819',

  Red50: '#f65050',
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
  Gray5: 'hsl(262, 10%, 95%)',
  Gray10: 'hsl(262, 9%, 91%)',
  Gray20: 'hsl(262, 7%, 85%)',
  Gray30: 'hsl(262, 6%, 80%)',
  Gray40: 'hsl(262, 5%, 68%)',
  Gray50: 'hsl(262, 4%, 57%)',
  Gray60: 'hsl(262, 3%, 46%)',
  Gray70: 'hsl(262, 2%, 37%)',
  Gray80: 'hsl(262, 1%, 29%)',
  Gray90: 'hsl(262, 0%, 24%)',
  Gray95: 'hsl(262, 0%, 15%)',
  Gray100: 'hsl(262, 0%, 3%)',

  Purple5: 'hsl(262, 81%, 98%)',
  Purple10: 'hsl(262, 76%, 96%)',
  Purple20: 'hsl(262, 71%, 92%)',
  Purple30: 'hsl(262, 66%, 86%)',
  Purple40: 'hsl(262, 53%, 77%)',
  Purple50: 'hsl(262, 53%, 68%)',
  Purple60: 'hsl(262, 53%, 59%)',
  Purple70: 'hsl(262, 53%, 51%)',
  Purple80: 'hsl(262, 53%, 41%)',
  Purple90: 'hsl(262, 53%, 34%)',
  Purple95: 'hsl(262, 53%, 19%)',

  Green5: 'hsl(117, 54%, 97%)',
  Green10: 'hsl(117, 54%, 94%)',
  Green20: 'hsl(117, 54%, 84%)',
  Green30: 'hsl(117, 54%, 72%)',
  Green40: 'hsl(117, 54%, 53%)',
  Green50: 'hsl(117, 54%, 42%)',
  Green60: 'hsl(117, 54%, 35%)',
  Green70: 'hsl(117, 54%, 28%)',
  Green80: 'hsl(117, 54%, 22%)',
  Green90: 'hsl(117, 54%, 18%)',
  Green95: 'hsl(117, 54%, 10%)',

  Orange5: 'hsl(28, 100%, 96%)',
  Orange10: 'hsl(28, 100%, 94%)',
  Orange20: 'hsl(28, 100%, 84%)',
  Orange30: 'hsl(28, 100%, 73%)',
  Orange40: 'hsl(28, 100%, 53%)',
  Orange50: 'hsl(28, 100%, 38%)',
  Orange60: 'hsl(28, 100%, 35%)',
  Orange70: 'hsl(28, 100%, 28%)',
  Orange80: 'hsl(28, 100%, 22%)',
  Orange90: 'hsl(28, 100%, 18%)',
  Orange95: 'hsl(28, 100%, 10%)',

  Red5: 'hsl(0, 85%, 98%)',
  Red10: 'hsl(0, 80%, 95%)',
  Red20: 'hsl(0, 82%, 92%)',
  Red30: 'hsl(0, 79%, 86%)',
  Red40: 'hsl(0, 75%, 77%)',
  Red50: 'hsl(0, 75%, 66%)',
  Red60: 'hsl(0, 75%, 53%)',
  Red70: 'hsl(0, 75%, 42%)',
  Red80: 'hsl(0, 75%, 33%)',
  Red90: 'hsl(0, 75%, 28%)',
  Red95: 'hsl(0, 75%, 16%)',
} satisfies ColorPalette;

export const PrintPalette = TouchscreenPalette;

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

const VVSG_MINIMUM_PRINT_FONT_SIZE_PTS = 10;

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
export const CAPITAL_HEIGHT_TO_FULL_FONT_HEIGHT_RATIO = 1 / 0.725;

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
function expandToFullColorTheme(theme: TouchscreenColorTheme): ColorTheme {
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

    warningContainer: theme.background,

    inverseBackground: theme.onBackground,
    onInverse: theme.background,
    inversePrimary: theme.background,
    inverseContainer: theme.onBackground,

    successAccent: theme.successAccent,
    warningAccent: theme.warningAccent,
    dangerAccent: theme.danger,
  };
}

export const colorThemes: Record<ColorMode, ColorTheme> = {
  contrastHighLight: expandToFullColorTheme({
    background: TouchscreenPalette.Gray0,
    onBackground: TouchscreenPalette.Gray100,
    primary: TouchscreenPalette.Gray100,
    danger: TouchscreenPalette.Gray100,
    warningAccent: TouchscreenPalette.Gray100,
    successAccent: TouchscreenPalette.Gray100,
  }),

  contrastHighDark: expandToFullColorTheme({
    background: TouchscreenPalette.Gray100,
    onBackground: TouchscreenPalette.Gray0,
    primary: TouchscreenPalette.Gray0,
    danger: TouchscreenPalette.Gray0,
    warningAccent: TouchscreenPalette.Gray0,
    successAccent: TouchscreenPalette.Gray0,
  }),

  contrastMedium: expandToFullColorTheme({
    background: TouchscreenPalette.Gray5,
    onBackground: TouchscreenPalette.Gray90,
    primary: TouchscreenPalette.Purple80,
    danger: TouchscreenPalette.Red80,
    warningAccent: TouchscreenPalette.Gray90,
    successAccent: TouchscreenPalette.Green80,
  }),

  contrastLow: expandToFullColorTheme({
    background: TouchscreenPalette.Gray90,
    onBackground: TouchscreenPalette.Gray50,
    primary: TouchscreenPalette.Purple50,
    danger: TouchscreenPalette.Red50,
    warningAccent: TouchscreenPalette.Orange50,
    successAccent: TouchscreenPalette.Green50,
  }),

  desktop: {
    background: DesktopPalette.Gray0,
    onBackground: DesktopPalette.Gray95,
    onBackgroundMuted: DesktopPalette.Gray70,

    container: DesktopPalette.Gray10,
    containerLow: DesktopPalette.Gray5,
    containerHigh: DesktopPalette.Gray20,
    outline: DesktopPalette.Gray40,

    primary: DesktopPalette.Purple80,
    onPrimary: DesktopPalette.Gray0,
    primaryContainer: DesktopPalette.Purple20,

    neutral: DesktopPalette.Gray80,
    onNeutral: DesktopPalette.Gray0,

    danger: DesktopPalette.Red80,
    onDanger: DesktopPalette.Gray0,
    dangerContainer: DesktopPalette.Red10,

    warningContainer: DesktopPalette.Orange10,

    inverseBackground: DesktopPalette.Gray95,
    onInverse: DesktopPalette.Gray0,
    inversePrimary: DesktopPalette.Purple30,
    inverseContainer: DesktopPalette.Gray80,

    successAccent: DesktopPalette.Green60,
    warningAccent: DesktopPalette.Orange50,
    dangerAccent: DesktopPalette.Red60,
  },

  print: expandToFullColorTheme({
    background: TouchscreenPalette.Gray0,
    danger: TouchscreenPalette.Gray100,
    onBackground: TouchscreenPalette.Gray100,
    primary: TouchscreenPalette.Gray100,
    successAccent: TouchscreenPalette.Gray100,
    warningAccent: TouchscreenPalette.Gray100,
  }),
};

const INCHES_PER_MM = 1 / 25.4;

/** Standard resolution for prints: */
const PIXELS_PER_INCH_PRINT = 72;

/** Standard resolution for web images/measurements: */
const PIXELS_PER_INCH_WEB = 96;

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

// When using `libs/ui` in a server environment, we don't have access to
// the window. The pixel ratio isn't used in enough places for this to be
// important, but setting it to a reasonable value here.
const WINDOWLESS_DEVICE_PIXEL_RATIO = 144;

/** PPI calculation functions by screen type: */
const devicePixelsPerInch: Record<ScreenType, () => number> = {
  builtIn: () =>
    // istanbul ignore next
    typeof window === 'undefined'
      ? WINDOWLESS_DEVICE_PIXEL_RATIO
      : window.devicePixelRatio * PIXELS_PER_INCH_WEB,
  elo13: () => SCREEN_WIDTH_PIXELS_ELO_13 / SCREEN_WIDTH_INCHES_ELO_13,
  elo15: () => SCREEN_WIDTH_PIXELS_ELO_15 / SCREEN_WIDTH_INCHES_ELO_15,
  lenovoThinkpad15: () =>
    SCREEN_WIDTH_PIXELS_THINKPAD_15 / SCREEN_WIDTH_INCHES_THINKPAD_15,
};

function mmToPx(mm: number, screenType: ScreenType): number {
  const pixelsPerInch: number = devicePixelsPerInch[screenType]();

  return mm * INCHES_PER_MM * pixelsPerInch;
}

function ptToPx(pt: number): number {
  return (pt / PIXELS_PER_INCH_PRINT) * PIXELS_PER_INCH_WEB;
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
  desktop: ({ screenType }) => ({
    borderRadiusRem: 0.5,
    bordersRem: {
      hairline: 0.06,
      thin: 0.09,
      medium: 0.15,
      thick: 0.25,
    },
    fontDefault:
      screenType === 'lenovoThinkpad15'
        ? 30 // VxAdmin, VxCentralScan
        : 16, // VxDesign
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
  print: () => ({
    borderRadiusRem: 0.5,
    bordersRem: {
      hairline: 0.06,
      thin: 0.1,
      medium: 0.15,
      thick: 0.25,
    },
    fontDefault: ptToPx(VVSG_MINIMUM_PRINT_FONT_SIZE_PTS),
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
    minTouchAreaSeparationPx: 0, // Not used for prints
    minTouchAreaSizePx: 0, // Not used for prints
  }),
  touchSmall: (p) => ({
    borderRadiusRem: 0.25,
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
    borderRadiusRem: 0.25,
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
    borderRadiusRem: 0.25,
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
    borderRadiusRem: 0.25,
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
  isVisualModeDisabled = false,
}: {
  colorMode?: ColorMode;
  screenType?: ScreenType;
  sizeMode?: SizeMode;
  isVisualModeDisabled?: boolean;
}): UiTheme {
  return {
    colorMode,
    colors: colorThemes[colorMode],
    screenType,
    sizeMode,
    sizes: sizeThemes[sizeMode]({ screenType, sizeMode }),
    isVisualModeDisabled,
  };
}
