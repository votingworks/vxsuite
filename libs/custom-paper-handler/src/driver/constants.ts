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
export const DEVICE_MAX_WIDTH_DOTS = 1700;

export const SCAN_HEADER_LENGTH_BYTES = 16;
