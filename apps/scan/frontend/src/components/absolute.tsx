import styled from 'styled-components';

interface Props {
  top?: boolean;
  right?: boolean;
  left?: boolean;
  bottom?: boolean;
  padded?: boolean;
}

export const Absolute = styled.div<Props>`
  /* stylelint-disable declaration-block-no-redundant-longhand-properties */
  position: absolute;
  top: ${({ top }) => top && 0};
  right: ${({ right }) => right && 0};
  bottom: ${({ bottom }) => bottom && 0};
  left: ${({ left }) => left && 0};
  padding: ${({ padded }) => padded && '1rem'};
`;
