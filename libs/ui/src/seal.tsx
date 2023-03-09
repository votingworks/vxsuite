/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import { ColorMode } from '@votingworks/types';
import React from 'react';
import styled, { css } from 'styled-components';

const sealMaxWidth = '250px';

const DARK_COLOR_MODES: ReadonlySet<ColorMode> = new Set<ColorMode>([
  'contrastHighDark',
  'contrastLow',
]);

const SealContainer = styled.div`
  max-width: ${sealMaxWidth};
  position: relative;
  width: 100%;

  ${(p) => DARK_COLOR_MODES.has(p.theme.colorMode) && darkModeSealStyles};
`;

const darkModeSealStyles = css`
  background: ${(p) => p.theme.colors.foreground};
  box-sizing: border-box;
  padding: 0.125rem;
  border-radius: 0.125rem;
`;

const SealImage = styled.img`
  max-width: ${sealMaxWidth};
  width: 100%;
`;

interface Props {
  seal?: string;
  sealUrl?: string;
}

export function Seal({ seal, sealUrl }: Props): JSX.Element {
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
