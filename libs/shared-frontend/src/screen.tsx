import styled from 'styled-components';
import { contrastTheme } from './themes';

interface Props {
  white?: boolean;
  grey?: boolean;
  navLeft?: boolean;
  navRight?: boolean;
}

export const Screen = styled.div<Props>`
  display: flex;
  flex-direction: ${({ navLeft, navRight }) =>
    (navLeft && 'row-reverse') || (navRight && 'row') || 'column'};
  background-color: ${({ white, grey }) =>
    white ? 'white' : grey ? contrastTheme.default.background : undefined};
  height: 100%;
  @media print {
    display: none;
  }
`;
