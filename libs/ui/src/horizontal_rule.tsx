import styled from 'styled-components';

interface Props {
  children?: string;
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
    margin-right: ${({ children }) => (children ? '0.5rem' : undefined)};
  }
  &::after {
    margin-left: ${({ children }) => (children ? '0.5rem' : undefined)};
  }
`;
