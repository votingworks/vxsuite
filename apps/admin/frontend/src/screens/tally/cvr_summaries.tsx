import styled from 'styled-components';

import { Card, ProgressBar } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { BORDER_LIGHT, GAP } from './styles';

const Container = styled.div`
  display: grid;
  gap: ${GAP};
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
`;

export interface CvrSummariesProps {
  cvrs: number;
  locations: Progress;
  scanners: number;
}

interface Progress {
  loaded: number;
  total: number;
}

export function CvrSummaries(props: CvrSummariesProps): JSX.Element {
  const { cvrs, locations, scanners } = props;

  return (
    <Container>
      <ProgressCard progress={locations} title="Locations" />
      <SummaryCard title="Scanners">{scanners}</SummaryCard>
      <SummaryCard title="CVRs">{cvrs}</SummaryCard>
    </Container>
  );
}

const SummaryCardContainer = styled(Card)`
  ${BORDER_LIGHT}

  /* [TODO] Update libs/ui/Card to support custom card body styling instead. */
  > * {
    display: grid;
    gap: ${GAP};
    padding: ${GAP};
  }
`;

const MetricPair = styled.div`
  align-items: center;
  display: flex;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  justify-content: space-between;

  > * {
    line-height: 1;
    margin: 0;
  }
`;

const MetricValue = styled.span`
  font-size: 1.5rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
`;

function SummaryCard(props: { title: string; children: number }) {
  const { children, title } = props;

  return (
    <SummaryCardContainer>
      <MetricPair>
        <span>{title}</span>
        <MetricValue>{format.count(children)}</MetricValue>
      </MetricPair>
    </SummaryCardContainer>
  );
}

function ProgressCard(props: { progress: Progress; title: string }) {
  const { progress, title } = props;

  return (
    <SummaryCardContainer>
      <MetricPair>
        <span>{title}</span>
        <MetricValue>
          {format.count(progress.loaded)} / {format.count(progress.total)}
        </MetricValue>
      </MetricPair>
      <ProgressBar progress={Math.min(1, progress.loaded / progress.total)} />
    </SummaryCardContainer>
  );
}
