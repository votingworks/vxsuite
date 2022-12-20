import styled, { css } from 'styled-components';

const ButtonFooterButtons = css`
  button {
    padding-right: 10px;
    padding-left: 10px;
  }
`;

export const ButtonFooter = styled.nav`
  display: flex;
  background-color: #333333;
  padding: 20px;
  color: #ffffff;
  gap: 20px;
  & > * {
    flex: 1;
    &:first-child {
      flex: 2 1;
      order: 1;
    }
  }
  /* stylelint-disable-next-line value-keyword-case, order/order */
  ${ButtonFooterButtons}
`;

export const ButtonFooterLandscape = styled.div`
  display: flex;
  gap: 20px;
  & > * {
    flex: 1;
  }
  /* stylelint-disable-next-line value-keyword-case, order/order */
  ${ButtonFooterButtons}
`;
