import { H5, Icons, LinkButton, Loading, P } from '@votingworks/ui';
import styled from 'styled-components';
import { routerPaths } from '../../router_paths';

export const ExportActions = styled.div`
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  display: flex;
  justify-content: start;
  gap: 1rem;
`;

export const PreviewContainer = styled.div`
  position: relative;
  min-height: 11in;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 10%);
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const PreviewOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 1;
  background: black;
  opacity: 0.3;
`;

export const PreviewReportPages = styled.div`
  section {
    background: white;
    position: relative;
    box-shadow: 0 3px 10px rgb(0, 0, 0, 20%);
    margin-top: 1rem;
    margin-bottom: 2rem;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

export const PreviewActionContainer = styled.div`
  position: absolute;
  inset: 0;
  margin-left: auto;
  margin-right: auto;
  margin-top: 4rem;
  display: flex;
  justify-content: center;
  align-items: start;
  z-index: 2;
`;

export const LoadingTextContainer = styled.div`
  background: white;
  width: 35rem;
  border-radius: 0.5rem;
`;

export const NoResultsNotice = styled(H5)`
  margin-top: 2rem;
`;

export const GenerateButtonWrapper = styled.div`
  button {
    width: 30%;
  }
`;

export function PreviewLoading(): JSX.Element {
  return (
    <PreviewActionContainer>
      <LoadingTextContainer>
        <Loading>Generating Report</Loading>
      </LoadingTextContainer>
    </PreviewActionContainer>
  );
}

export function ReportBackButton(): JSX.Element {
  return (
    <LinkButton icon="Previous" to={routerPaths.reports}>
      Back
    </LinkButton>
  );
}

export const WarningContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0.5rem 0;

  p {
    margin-bottom: 0;
  }
`;

export function ReportWarning({ text }: { text: string }): JSX.Element {
  return (
    <WarningContainer>
      {text && (
        <P>
          <Icons.Warning /> {text}
        </P>
      )}
    </WarningContainer>
  );
}
