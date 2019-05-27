import styled from 'styled-components'

interface Props {
  dark?: boolean
  secondary?: boolean
  separatePrimaryButton?: boolean
  centerOnlyChild?: boolean
}

const ButtonBar = styled('nav')<Props>`
  display: flex;
  flex-wrap: wrap-reverse;
  align-items: center;
  justify-content: space-between;
  order: ${({ secondary }) => (secondary ? '-1' : undefined)};
  border-bottom: 1px solid rgb(169, 169, 169);
  background: ${({ dark = true }) =>
    dark ? '#455a64' : 'rgba(0, 0, 0, 0.05)'};
  padding: 0.25rem;

  & > *:first-child {
    order: 2;
    @media (min-width: 480px) {
      margin-left: ${({ separatePrimaryButton }) =>
        separatePrimaryButton ? 'auto' : undefined};
    }
  }

  & > * {
    flex: 1;
    margin: 0.25rem;
    @media (min-width: 480px) {
      flex: ${({ separatePrimaryButton }) =>
        separatePrimaryButton ? '0' : undefined};
    }
  }
  & > *:only-child {
    @media (min-width: 480px) {
      flex: 0;
      margin: ${({ centerOnlyChild = true }) =>
        centerOnlyChild ? 'auto' : undefined};
      min-width: 33.333%;
    }
  }
  @media print {
    display: none;
  }
`

export default ButtonBar
