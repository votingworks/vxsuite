import styled, { css } from 'styled-components';

// const ButtonFooterButtons = css`
//   button {
//     padding-right: 10px;
//     padding-left: 10px;
//   }
// `;

export const ButtonFooter = styled.nav`
  display: flex;
  background: ${(p) => p.theme.colors.background};
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  padding: 0.8rem 0.8rem 0.8rem;
  gap: 0.5rem;
  & > * {
    flex: 1;
    &:first-child {
      flex: 3 1;
      order: 1;
    }
  }
`;

export const ButtonFooterLandscape = styled.div`
  display: flex;
  gap: 20px;
  & > * {
    flex: 1;
  }
`;
