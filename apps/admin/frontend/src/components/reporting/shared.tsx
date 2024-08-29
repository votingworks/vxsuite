import { Card, H3, H5, Icons } from '@votingworks/ui';
import styled from 'styled-components';
import { routerPaths } from '../../router_paths';

export const ExportActions = styled.div`
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
  margin: 1rem 1rem 0;
  overflow: visible;
`;

export const ControlLabel = styled(H3)`
  /* No added styles */
`;

export const WarningContainer = styled.div`
  margin-top: 1rem;
`;

export function ReportWarning({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element | null {
  return (
    <WarningContainer>
      <Icons.Warning color="warning" /> {children}
    </WarningContainer>
  );
}

export const reportParentRoutes = [
  { title: 'Reports', path: routerPaths.reports },
];

/**
 * Goes around all of the content in a report screen. The flex column
 * ensures that the report PDF viewer is able to fill the entirety of the
 * container.
 */
export const ReportScreenContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
`;
