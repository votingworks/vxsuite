import styled from 'styled-components';

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
  height: 100%;

  @media print {
    display: none;
  }
`;
