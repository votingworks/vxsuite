import styled from 'styled-components'

interface Props {
  dark?: boolean
  secondary?: boolean
  separatePrimaryButton?: boolean
  centerOnlyChild?: boolean
}

const ButtonBar = styled('nav')<Props>`
  order: ${({ secondary }) => (secondary ? '-1' : undefined)};
  display: flex;
  flex-wrap: wrap-reverse;
  padding: 0.5rem;
  background: ${({ dark = true }) =>
    dark ? '#455a64' : 'rgba(0, 0, 0, 0.05)'};
  border-bottom: 1px solid darkgrey;
  justify-content: space-between;
  align-items: center;

  & > *:first-child {
    order: 2;
    @media (min-width: 480px) {
      margin-left: ${({ separatePrimaryButton }) =>
        separatePrimaryButton ? 'auto' : undefined};
    }
  }

  & > * {
    margin: 0.25rem;
    flex: 1;
    @media (min-width: 480px) {
      flex: ${({ separatePrimaryButton }) =>
        separatePrimaryButton ? '0' : undefined};
    }
  }
  & > *:only-child {
    @media (min-width: 480px) {
      margin: ${({ centerOnlyChild = true }) =>
        centerOnlyChild ? 'auto' : undefined};
      min-width: 33.333%;
      flex: 0;
    }
  }
  @media print {
    display: none;
  }
`

export default ButtonBar
