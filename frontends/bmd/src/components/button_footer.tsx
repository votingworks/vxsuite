import styled from 'styled-components';

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
  button {
    padding-right: 10px;
    padding-left: 10px;
  }
`;
