/* istanbul ignore file - purely presentational component. */
import styled, { css } from 'styled-components';

const portraitStyles = css`
  align-items: stretch;
  border-top: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  gap: 0.5rem;
  justify-content: right;
  min-height: 4.5rem;
  padding: 0.5rem;

  & > * {
    &:not(:first-child, :last-child) {
      flex-grow: 1;
    }
  }
`;

const landscapeStyles = css`
  border-left: ${(p) => p.theme.sizes.bordersRem.thick}rem solid
    ${(p) => p.theme.colors.outline};
  flex-direction: column;
  gap: 1rem;
  justify-content: center;
  padding: 0.5rem;

  & > * {
    min-height: 3rem;
  }
`;

export const ButtonFooter = styled.nav`
  display: flex;

  @media (orientation: portrait) {
    ${portraitStyles}
  }

  @media (orientation: landscape) {
    ${landscapeStyles}
  }
`;
