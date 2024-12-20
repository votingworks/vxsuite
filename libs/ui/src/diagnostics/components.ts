import styled from 'styled-components';

export const ReportContents = styled.section`
  display: flex;
  flex-direction: column;

  &:not(:first-child) {
    margin-top: 1.5em;
  }

  row-gap: 1.5em;
`;
