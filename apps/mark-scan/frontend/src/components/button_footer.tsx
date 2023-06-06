/* stylelint-disable order/properties-order */
import styled from 'styled-components';

export const ButtonFooter = styled.nav`
  align-items: stretch;
  border-top: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.foreground};
  display: flex;
  gap: 0.5rem;
  justify-content: right;
  min-height: 4.5rem;
  padding: 0.5rem;

  & > * {
    &:not(:first-child):not(:last-child) {
      flex-grow: 1;
    }
  }
`;
