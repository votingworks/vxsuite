export enum FontFamily {
  NOTO_EMOJI = 'Noto Emoji',
  ROBOTO = 'Vx Roboto',
}

export const VX_DEFAULT_FONT_FAMILY_DECLARATION = [
  `'${FontFamily.ROBOTO}'`,
  `'${FontFamily.NOTO_EMOJI}'`,
  'sans-serif',
].join(', ');
