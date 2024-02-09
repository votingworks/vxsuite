import { Card, H3, H5, Icons } from '@votingworks/ui';
import styled from 'styled-components';
import { routerPaths } from '../../router_paths';

export const ExportActions = styled.div`
  margin-bottom: 1rem;
  display: flex;
  justify-content: start;
  gap: 0.5rem;
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
