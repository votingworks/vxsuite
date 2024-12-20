import styled from 'styled-components';

export const ButtonList = styled.p`
  column-gap: 1rem;

  @media (min-width: 1024px) {
    columns: 2;
  }

  @media (min-width: 1440px) {
    columns: 3;
  }

  & > button {
    margin-bottom: 0.5rem;
    width: 100%;
    overflow: hidden;
  }
`;
