import styled from 'styled-components'

interface Props {
  secondary?: boolean
}

const ButtonBar = styled('nav')<Props>`
  order: ${({ secondary }) => (secondary ? '-1' : undefined)};
  display: flex;
  padding: 0.5rem;
  background: #455a64;
  border-bottom: 1px solid darkgrey;
  justify-content: space-between;
  align-items: center;
  & > :first-child {
    order: 2;
  }
  & > * {
    margin: 0.25rem
    flex: 1;
  }
  @media print {
    display: none;
  }
`

export default ButtonBar
