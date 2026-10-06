import type { DefaultTheme } from 'styled-components';
import type { EnumValues } from '@votingworks/basics';
import type { IconName } from '../icons.js';

export const ActionKey = {
  DELETE: 'delete',
  CANCEL: 'cancel',
  ACCEPT: 'accept',
} as const;

export type ActionKey = EnumValues<typeof ActionKey>;

export interface Key {
  audioLanguageOverride?: string;
  renderAudioString: () => React.ReactNode;
  /** @defaultvalue () => {@link value} */
  renderLabel?: () => React.ReactNode;
  value: string;
  columnSpan?: number;
  icon?: IconName;
  action?: ActionKey;
}

// @coverage-exclude
export function getBorderWidthRem(p: { theme: DefaultTheme }): number {
  switch (p.theme.sizeMode) {
    case 'touchExtraLarge':
      return p.theme.sizes.bordersRem.hairline;
    default:
      return p.theme.sizes.bordersRem.thin;
  }
}
