import styled from 'styled-components'

interface Props {
  dark?: boolean
  primaryRight?: boolean
  padded?: boolean
}

const ButtonBar = styled('nav')<Props>`
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: center;
  justify-content: space-between;
  background: ${({ dark = false }) =>
    dark ? '#333333' : 'rgba(0, 0, 0, 0.05)'};
  padding: ${({ padded = false }) => (padded ? '0.25rem' : undefined)};

  & > * {
    flex-grow: 1;
    margin: 0.25rem;
  }

  & > *:first-child {
    order: ${({ primaryRight = false }) => (primaryRight ? 2 : undefined)};
  }
`

export default ButtonBar
