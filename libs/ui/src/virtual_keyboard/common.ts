import { DefaultTheme } from 'styled-components';

export interface Key {
  audioLanguageOverride?: string;
  renderAudioString: () => React.ReactNode;
  /** @defaultvalue () => {@link value} */
  renderLabel?: () => React.ReactNode;
  value: string;
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
