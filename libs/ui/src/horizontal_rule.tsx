import styled from 'styled-components';

interface Props {
  color?: string;
}

export const HorizontalRule = styled.p<Props>`
  display: flex;
  align-items: center;
  margin: -0.5rem 0;
  &::after,
  &::before {
    flex: 1;
    border-top: 1px solid
      ${({ color }) => (color ? 'rgb(194, 200, 203)' : undefined)};
    content: '';
  }
  &::before {
    margin-right: 0.5rem;
  }
  &::after {
    margin-left: 0.5rem;
  }
`;
