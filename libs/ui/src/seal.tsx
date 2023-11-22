import styled from 'styled-components';

import { ColorMode } from '@votingworks/types';

const sealMaxWidth = '250px';

const DARK_COLOR_MODES: ReadonlySet<ColorMode> = new Set<ColorMode>([
  'contrastHighDark',
  'contrastLow',
]);

const SealContainer = styled.div<{ inverse?: boolean }>`
  height: 100%;
  max-height: ${sealMaxWidth};
  max-width: ${sealMaxWidth};
  position: relative;
  width: 100%;

  /**
  * Add a light background behind the seal image to provide contrast against
  * inverse backgrounds or dark theme backgrounds.
  */
  background: ${(p) =>
    p.inverse
      ? p.theme.colors.onInverse
      : DARK_COLOR_MODES.has(p.theme.colorMode)
      ? p.theme.colors.inverseBackground
      : p.theme.colors.background};
  border-radius: 50%;
  box-sizing: border-box;
`;

export interface SealProps {
  seal: string;
  inverse?: boolean;
}

export function Seal({ seal, inverse }: SealProps): JSX.Element {
  return (
    <SealContainer
      inverse={inverse}
      aria-hidden
      data-testid="seal"
      dangerouslySetInnerHTML={{ __html: seal }}
    />
  );
}
