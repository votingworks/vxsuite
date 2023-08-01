import styled, { css } from 'styled-components';
import { contrastTheme } from './themes';

interface Props {
  white?: boolean;
  grey?: boolean;
  navLeft?: boolean;
  navRight?: boolean;
}

const legacyStyles = css<Props>`
  background-color: ${({ white, grey }) =>
    white ? 'white' : grey ? contrastTheme.default.background : undefined};
`;

export const Screen = styled.div<Props>`
  display: flex;
  flex-direction: ${({ navLeft, navRight }) =>
    (navLeft && 'row-reverse') || (navRight && 'row') || 'column'};
  height: 100%;

  /* Legacy (non-VVSG-compliant) colors: */
  ${(p) => (p.theme.colorMode === 'legacy' ? legacyStyles : undefined)}

  @media print {
    display: none;
  }
`;
