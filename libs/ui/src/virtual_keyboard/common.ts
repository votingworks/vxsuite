import { DefaultTheme } from 'styled-components';
import { IconName } from '../icons';

export enum ActionKey {
  DELETE = 'delete',
  CANCEL = 'cancel',
  ACCEPT = 'accept',
}

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

/* istanbul ignore next - @preserve */
export function getBorderWidthRem(p: { theme: DefaultTheme }): number {
  switch (p.theme.sizeMode) {
    case 'touchExtraLarge':
      return p.theme.sizes.bordersRem.hairline;
    default:
      return p.theme.sizes.bordersRem.thin;
  }
}
