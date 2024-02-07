import { Card, H3, H5, Icons, Loading } from '@votingworks/ui';
import styled from 'styled-components';
import { routerPaths } from '../../router_paths';

export const ExportActions = styled.div`
  margin-bottom: 1rem;
  display: flex;
  justify-content: start;
  gap: 0.5rem;
`;

export const PreviewContainer = styled.div`
  position: relative;
  min-height: 11in;
  padding: 0.5rem;
  background: ${(p) => p.theme.colors.container};
  display: flex;
  flex-direction: column;
  align-items: center;

  /* Override the padding on the main container so that the preview runs to the
   * side edges and bottom of the main container. */
  left: -1rem;
  width: calc(100% + 2rem);
  margin-bottom: -1rem;
`;

export const PreviewReportPages = styled.div`
  section {
    /* The report pages are rendered as HTML elements with fixed sizes, so we
     * zoom them to make them more readable on the screen. */
    zoom: 1.75;
    background: white;
    position: relative;
    box-shadow: 0 3px 10px rgb(0, 0, 0, 20%);
    margin: 0.5rem;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;

    &:not(:last-child) {
      margin-bottom: 2rem;
    }
  }
`;

export const PreviewLoadingContainer = styled.div`
  margin-top: 4rem;
  display: flex;
  justify-content: center;
`;

export const NoResultsNotice = styled(H5)`
  margin-top: 2rem;
`;

export const GenerateButtonWrapper = styled.div`
  margin-left: auto;
  margin-bottom: 1rem;

  button {
    min-width: 15rem;
  }
`;

export const ReportBuilderControls = styled(Card)`
  background: ${(p) => p.theme.colors.containerLow};
  margin-bottom: 1rem;
  overflow: visible;
`;

export const ControlLabel = styled(H3)`
  /* No added styles */
`;

export function PreviewLoading(): JSX.Element {
  return (
    <PreviewLoadingContainer>
      <Loading>Generating Report</Loading>
    </PreviewLoadingContainer>
  );
}

export const WarningContainer = styled.div`
  margin: 1rem 0;
`;

export function ReportWarning({ text }: { text: string }): JSX.Element | null {
  if (!text) {
    return null;
  }
  return (
    <WarningContainer>
      <Icons.Warning color="warning" /> {text}
    </WarningContainer>
  );
}

export const reportParentRoutes = [
  { title: 'Reports', path: routerPaths.reports },
];
