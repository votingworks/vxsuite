import { Uint8 } from '@votingworks/message-coder';

export const NULL_CODE: Uint8 = 0x00;
export const TOKEN: Uint8 = 0x01;
export const START_OF_PACKET: Uint8 = 0x02;
export const OK_CONTINUE: Uint8 = 0x00;
export const OK_NO_MORE_DATA: Uint8 = 0xff;

export const PRINT_MODE_8_DOT_SINGLE_DENSITY = 0;
export const PRINT_MODE_8_DOT_DOUBLE_DENSITY = 1;
export const PRINT_MODE_24_DOT_SINGLE_DENSITY = 32;
export const PRINT_MODE_24_DOT_DOUBLE_DENSITY = 33;

export const SCAN_HEADER_LENGTH_BYTES = 16;
