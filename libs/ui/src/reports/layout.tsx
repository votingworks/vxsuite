import styled, { DefaultTheme } from 'styled-components';
import { makeTheme } from '../themes/make_theme';

export const TallyReportColumns = styled.div`
  columns: 3;
  column-gap: 0.3in;
  margin-top: 1.5em;

  & > div {
    margin-top: 0;
  }
`;

export const PrintedReport = styled.section`
  font-size: 12px;
  page-break-after: always;

  @media print {
    font-size: 12px;
  }
`;

export const PrintedReportPreview = styled.div`
  section {
    margin: 1rem 0 2rem;
    background: #fff;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

export const reportColors = {
  container: '#e8e8e8',
  outline: 'rgb(194, 200, 203)',
} as const;

export const Box = styled.div`
  background-color: ${reportColors.container};
  border: 1px solid ${reportColors.outline};
  padding: 0.5em;
`;

export function printedReportThemeFn(theme?: DefaultTheme): DefaultTheme {
  return makeTheme({
    screenType: /* istanbul ignore next */ theme?.screenType,
    sizeMode: 'touchSmall',
    colorMode: 'contrastHighLight',
  });
}
