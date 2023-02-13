/* istanbul ignore file */

import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  LARGE_DISPLAY_FONT_SIZE,
} from './globals';

export interface FontSizeTheme {
  fontSize?: string;
}

export interface ColorTheme {
  background?: string;
  color?: string;
}

export interface Theme extends FontSizeTheme, ColorTheme {}

export const fontSizeTheme = {
  normal: {
    fontSize: `${FONT_SIZES[DEFAULT_FONT_SIZE]}px`,
  },
  medium: {
    fontSize: `${FONT_SIZES[2]}px`,
  },
  large: {
    fontSize: `${FONT_SIZES[LARGE_DISPLAY_FONT_SIZE]}px`,
  },
} as const;

export const contrastTheme = {
  default: {
    color: '#263238',
    background: '#edeff0',
  },
  dark: {
    color: '#ffffff',
    background: '#455a64',
  },
} as const;
