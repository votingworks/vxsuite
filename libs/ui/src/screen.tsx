import styled from 'styled-components';

interface Props {
  flexDirection?: 'row' | 'column' | 'row-reverse';
}

export const Screen = styled.div<Props>`
  display: flex;
  flex-direction: ${({ flexDirection = 'column' }) => flexDirection};
  height: 100%;

  @media print {
    display: none;
  }
`;
