import styled from 'styled-components'

export const HorizontalRule = styled.p`
  display: flex;
  align-items: center;
  margin: ${({ children }) => (children ? '-0.5rem 0' : undefined)};
  &::after,
  &::before {
    flex: 1;
    border-top: 1px solid rgb(194, 200, 203);
    content: '';
  }
  &::before {
    margin-right: ${({ children }) => (children ? '0.5rem' : undefined)};
  }
  &::after {
    margin-left: ${({ children }) => (children ? '0.5rem' : undefined)};
  }
`
