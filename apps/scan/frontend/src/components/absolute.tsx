import styled from 'styled-components';

interface Props {
  top?: boolean;
  right?: boolean;
  left?: boolean;
  bottom?: boolean;
  padded?: boolean;
}

export const Absolute = styled.div<Props>`
  position: absolute;
  inset: ${({ top }) => top && 0} ${({ right }) => right && 0} ${({ bottom }) => bottom && 0} ${({ left }) => left && 0};
  padding: ${({ padded }) => padded && '1rem'};
`;
