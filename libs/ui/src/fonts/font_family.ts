import type { EnumValues } from '@votingworks/basics';

export const FontFamily = {
  DEJAVU_SANS_MONO: 'DejaVu Sans Mono',
  NOTO_EMOJI: 'Noto Emoji',
  ROBOTO: 'Vx Roboto',
} as const;

export type FontFamily = EnumValues<typeof FontFamily>;

export const VX_DEFAULT_FONT_FAMILY_DECLARATION = [
  `'${FontFamily.ROBOTO}'`,
  `'${FontFamily.NOTO_EMOJI}'`,
  'sans-serif',
].join(', ');

export const VX_DEFAULT_MONOSPACE_FONT_FAMILY_DECLARATION = [
  `'${FontFamily.DEJAVU_SANS_MONO}'`,
  'monospace',
].join(', ');
