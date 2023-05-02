export type RGBA = [number, number, number, number];

export const PIXEL_BLACK = 0;
export const PIXEL_WHITE = (1 << 8) - 1;
export const RGBA_BLACK: RGBA = [PIXEL_BLACK, PIXEL_BLACK, PIXEL_BLACK, 0xff];
export const RGBA_WHITE: RGBA = [PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE, 0xff];
