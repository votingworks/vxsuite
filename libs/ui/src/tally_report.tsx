import styled from 'styled-components';

export const ReportSection = styled.section`
  page-break-before: always;
`;

export const TallyReportTitle = styled.h1`
  font-weight: 400;
`;
export const TallyReportColumns = styled.div`
  columns: 3;
  column-gap: 0.3in;
  margin-top: 1rem;
  & > div {
    margin-top: 0;
  }
`;
export const TallyReport = styled.div`
  font-size: 12px;
  @media print {
    font-size: 12px;
  }
`;

export const PrintableContainer = styled.div`
  margin: 0;
  page-break-after: always;
  @media screen {
    display: none;
  }
`;
