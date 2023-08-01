import styled from 'styled-components';

interface Props {
  dark?: boolean;
  naturalOrder?: boolean;
  secondary?: boolean;
  separatePrimaryButton?: boolean;
  centerOnlyChild?: boolean;
}

export const ButtonBar = styled('nav')<Props>`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  order: ${({ secondary }) => (secondary ? '-1' : undefined)};
  border-bottom: 1px solid rgb(169, 169, 169);
  background: ${({ dark = true }) =>
    dark ? '#455a64' : 'rgba(0, 0, 0, 0.05)'};
  padding: 0.5rem;

  & > * {
    white-space: nowrap;
    flex: 1;
    margin: 0.25rem;

    @media (width >= 480px) {
      flex: ${({ separatePrimaryButton }) =>
        separatePrimaryButton ? '0' : undefined};
    }
  }

  & > *:first-child {
    order: ${({ naturalOrder = false }) => (naturalOrder ? undefined : '2')};

    @media (width >= 480px) {
      margin-right: ${({ naturalOrder = false, separatePrimaryButton }) =>
        separatePrimaryButton && naturalOrder ? 'auto' : undefined};
      margin-left: ${({ naturalOrder = false, separatePrimaryButton }) =>
        separatePrimaryButton && !naturalOrder ? 'auto' : undefined};
    }
  }

  & > *:only-child {
    @media (width >= 480px) {
      flex: ${({ centerOnlyChild = true }) => (centerOnlyChild ? 0 : 1)};
      margin: ${({ centerOnlyChild = true }) =>
        centerOnlyChild ? 'auto' : undefined};
      min-width: 33.333%;
    }
  }

  @media print {
    display: none;
  }
`;
