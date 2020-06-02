import styled from 'styled-components'

const HorizontalRule = styled.p`
  display: flex;
  align-items: center;
  margin: ${({ children }) => (children ? '-0.5rem 0' : undefined)};
  &::after,
  &::before {
    flex: 1;
    border-top: 1px solid rgb(180, 180, 180);
    content: '';
  }
  &::before {
    margin-right: ${({ children }) => (children ? '0.5rem' : undefined)};
  }
  &::after {
    margin-left: ${({ children }) => (children ? '0.5rem' : undefined)};
  }
`

export default HorizontalRule
