import { throwIllegalValue } from '@votingworks/basics';
import { Uint8 } from '@votingworks/message-coder';

/**
 * Maximum value of a `Uint16`
 */
export const UINT_16_MAX = 65535;

/**
 * Max and min values of signed Int16
 */
export const INT_16_MIN = -32768;
export const INT_16_MAX = 32867;

export const NULL_CODE: Uint8 = 0x00;
export const TOKEN: Uint8 = 0x01;
export const START_OF_PACKET: Uint8 = 0x02;
export const OK_CONTINUE: Uint8 = 0x00;
export const OK_NO_MORE_DATA: Uint8 = 0xff;

export type PrintingDensity = '-25%' | '-12.5%' | 'default' | '+12.5%' | '+25%';
export type PrintingSpeed = 'slow' | 'normal' | 'fast';
export const PRINTING_SPEED_CODES: Record<PrintingSpeed, Uint8> = {
  slow: 0,
  normal: 1,
  fast: 2,
};

export const PRINTING_DENSITY_CODES: Record<PrintingDensity, Uint8> = {
  '-25%': 0x02,
  '-12.5%': 0x03,
  default: 0x04,
  '+12.5%': 0x05,
  '+25%': 0x06,
};
// Exhaustive list of scan types.
// Manual reference: "Start scan ticket" 0x1C 0x53 0x50 0x53
export enum ScanTypes {
  NA = 0x00,
  /**
   * Red light scan (8bpp)
   */
  RED = 0x01,
  /**
   * Green light scan (8bpp)
   */
  GREEN = 0x02,
  /**
   * Blue light scan (8bpp)
   */
  BLUE = 0x03,
  /**
   * Ultraviolet light scan (8bpp)
   */
  ULTRAVIOLET = 0x04,
  /**
   * White light scan (8bpp)
   */
  GRAY = 0x05,
  /**
   * first line RED, second line GREEN, third line BLUE (24bpp)
   */
  RGB_RAW = 0x06,
  /**
   * first line RED, second line GREEN, third line BLUE, fourth line UV (32bpp)
   */
  RGBU_RAW = 0x07,
  /**
   * Black and white with red light (1bpp)
   */
  BW_RED = 0x08,
  /**
   * Black and white with green light (1bpp)
   */
  BW_GREEN = 0x09,
  /**
   * Black and white with blue light (1bpp)
   */
  BW_BLUE = 0x0a,
  /**
   * Black and white with ultraviolet light (1bpp)
   */
  BW_ULTRAVIOLET = 0x0b,
  /**
   * Black and white with white light (1bpp)
   */
  BW = 0x0c,
}

export function getBitsPerPixelForScanType(scanType: ScanTypes): number {
  switch (scanType) {
    case ScanTypes.NA:
      return 0;
    case ScanTypes.RED:
    case ScanTypes.GREEN:
    case ScanTypes.BLUE:
    case ScanTypes.ULTRAVIOLET:
    case ScanTypes.GRAY:
      return 8;
    case ScanTypes.BW_RED:
    case ScanTypes.BW_GREEN:
    case ScanTypes.BW_BLUE:
    case ScanTypes.BW_ULTRAVIOLET:
    case ScanTypes.BW:
      return 1;
    case ScanTypes.RGB_RAW:
      return 24;
    case ScanTypes.RGBU_RAW:
      return 32;
    default:
      throwIllegalValue(scanType);
  }
}
export enum PrintModeDotDensity {
  SINGLE_DOT_24 = 32,
  DOUBLE_DOT_24 = 33,
}
// Both supported values for PrintModeDotDensity have 24 dots in the vertical direction.
// See command manual page 84: 0x1B 0x2A "Select image print mode"
// This const should be extended if adding support for 8 dot density.
export const VERTICAL_DOTS_IN_CHUNK = 24;

/**
 * Maximum width the device can print, in dots
 */
export enum MaxPrintWidthDots {
  BMD_155 = 1700,
  BMD_150 = 1600,
}

export const SCAN_HEADER_LENGTH_BYTES = 16;

export enum RealTimeRequestIds {
  SCANNER_COMPLETE_STATUS_REQUEST_ID = 0x73,
  PRINTER_STATUS_REQUEST_ID = 0x64,
  SCAN_ABORT_REQUEST_ID = 0x43,
  SCAN_RESET_REQUEST_ID = 0x52,
}
