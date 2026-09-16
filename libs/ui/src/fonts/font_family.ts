export enum FontFamily {
  DEJAVU_SANS_MONO = 'DejaVu Sans Mono',
  NOTO_EMOJI = 'Noto Emoji',
  ROBOTO = 'Vx Roboto',
}

export const VX_DEFAULT_FONT_FAMILY_DECLARATION = [
  `'${FontFamily.ROBOTO}'`,
  `'${FontFamily.NOTO_EMOJI}'`,
  'sans-serif',
].join(', ');

export const VX_DEFAULT_MONOSPACE_FONT_FAMILY_DECLARATION = [
  `'${FontFamily.DEJAVU_SANS_MONO}'`,
  'monospace',
].join(', ');
