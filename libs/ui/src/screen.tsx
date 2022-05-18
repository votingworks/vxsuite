import styled from 'styled-components';

interface Props {
  white?: boolean;
  navLeft?: boolean;
  navRight?: boolean;
}

export const Screen = styled.div<Props>`
  display: flex;
  flex-direction: ${({ navLeft, navRight }) =>
    (navLeft && 'row-reverse') || (navRight && 'row') || 'column'};
  background-color: ${({ white }) => (white ? 'white' : undefined)};
  height: 100%;
  @media print {
    display: none;
  }
`;
