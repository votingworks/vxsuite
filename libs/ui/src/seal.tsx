import styled from 'styled-components';
import { Buffer } from 'node:buffer';

import { ColorMode } from '@votingworks/types';

const DARK_COLOR_MODES: ReadonlySet<ColorMode> = new Set<ColorMode>([
  'contrastHighDark',
  'contrastLow',
]);

const SealImage = styled.img<{ inverse?: boolean }>`
  height: 100%;
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
  maxWidth: string;
  seal: string;
  inverse?: boolean;
  style?: React.CSSProperties;
}

export function Seal({
  seal,
  maxWidth,
  style,
  inverse,
}: SealProps): JSX.Element | null {
  // Handle empty string case for CDF ballot definition, which has no seal field
  if (!seal) return null;
  return (
    <SealImage
      aria-hidden
      src={`data:image/svg+xml;base64,${Buffer.from(seal).toString('base64')}`}
      data-testid="seal"
      alt="Seal"
      inverse={inverse}
      style={{ maxWidth, maxHeight: maxWidth, ...(style ?? {}) }}
    />
  );
}
