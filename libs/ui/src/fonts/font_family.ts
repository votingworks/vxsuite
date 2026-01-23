export enum FontFamily {
  NOTO_EMOJI = 'Noto Emoji',
  ROBOTO = 'Vx Roboto',
  FIRA_CODE = 'Vx Fira Code',
}

export const VX_DEFAULT_FONT_FAMILY_DECLARATION = [
  `'${FontFamily.ROBOTO}'`,
  `'${FontFamily.NOTO_EMOJI}'`,
  'sans-serif',
].join(', ');

export const VX_DEFAULT_MONOSPACE_FONT_FAMILY_DECLARATION = [
  `'${FontFamily.FIRA_CODE}'`,
  'monospace',
].join(', ');
