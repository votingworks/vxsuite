import styled, { DefaultTheme } from 'styled-components';
import { Icons } from '../icons';
import { H3 } from '../typography';
import { makeTheme } from '../themes/make_theme';

export const ReportSection = styled.section`
  page-break-before: always;
`;

export const TallyReportTitle = styled.h1`
  font-weight: 400;
`;
export const TallyReportColumns = styled.div`
  columns: 3;
  column-gap: 0.3in;
  margin-top: 1.5em;
  & > div {
    margin-top: 0;
  }
`;
export const TallyReport = styled.div`
  font-size: 12px;
  @media print {
    font-size: 12px;
  }
  @page {
    size: letter portrait;
  }
`;

export const TallyReportPreview = styled.div`
  section {
    margin: 1rem 0 2rem;
    background: #ffffff;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

export function tallyReportThemeFn(theme?: DefaultTheme): DefaultTheme {
  return makeTheme({
    screenType: theme?.screenType,
    sizeMode: 's',
    colorMode: 'contrastHighLight',
  });
}

const ReportPreviewLoadingWrapper = styled.section`
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1rem 0;
  background: #ffffff;
  width: 8in;
  height: 5.5in;
`;

export function ReportPreviewLoading(): JSX.Element {
  return (
    <ReportPreviewLoadingWrapper>
      <H3>
        <Icons.Loading /> Generating Report
      </H3>
    </ReportPreviewLoadingWrapper>
  );
}
