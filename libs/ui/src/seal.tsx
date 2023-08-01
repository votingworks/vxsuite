import styled, { css } from 'styled-components';

import { ColorMode } from '@votingworks/types';

const sealMaxWidth = '250px';

const DARK_COLOR_MODES: ReadonlySet<ColorMode> = new Set<ColorMode>([
  'contrastHighDark',
  'contrastLow',
]);

/**
 * Adds a light background behind the seal image to provide contrast against
 * dark backgrounds when using dark themes.
 */
const darkModeSealStyles = css`
  background: ${(p) => p.theme.colors.foreground};
  border-radius: 50%;
  box-sizing: border-box;
  padding: 0.125rem;
`;

const SealContainer = styled.div`
  height: 100%;
  max-height: ${sealMaxWidth};
  max-width: ${sealMaxWidth};
  position: relative;
  width: 100%;

  ${(p) => DARK_COLOR_MODES.has(p.theme.colorMode) && darkModeSealStyles};
`;

const SealImage = styled.img`
  width: 100%;
`;

export interface SealProps {
  seal?: string;
  sealUrl?: string;
}

export function Seal({ seal, sealUrl }: SealProps): JSX.Element {
  return (
    <SealContainer
      aria-hidden
      dangerouslySetInnerHTML={seal ? { __html: seal } : undefined}
    >
      {(!seal && sealUrl && <SealImage alt="state seal" src={sealUrl} />) ||
        undefined}
    </SealContainer>
  );
}
