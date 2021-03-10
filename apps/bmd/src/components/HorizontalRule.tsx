// TODO: Merge with same component in election-manager
import styled from 'styled-components'

const HorizontalRule = styled.p`
  display: flex;
  align-items: center;
  &::after,
  &::before {
    flex: 1;
    border-top: 1px solid rgb(128 128 128);
    content: '';
  }
  &::before {
    margin-right: 0.5em;
  }
  &::after {
    margin-left: 0.5em;
  }
`

export default HorizontalRule
