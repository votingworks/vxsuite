import { Card, Icons, P } from '@votingworks/ui';
import styled from 'styled-components';
import { iter } from '@votingworks/basics';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';

const Stats = styled.div`
  display: flex;
  gap: 1rem;
`;

const StatCard = styled(Card)`
  flex: 1;
`;

const StatLabel = styled.div`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

const StatValue = styled.div`
  font-size: 1.8rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 1.25;
`;

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}): JSX.Element {
  return (
    <div>
      <StatLabel>{label}</StatLabel>
      <StatValue data-testid={testId}>{format.count(value)}</StatValue>
    </div>
  );
}

export function BatchSummaryStats({
  status,
  showEmptyState,
}: {
  status: ScanStatus;
  showEmptyState?: boolean;
}): JSX.Element {
  const { batches } = status;
  const sheetCount = iter(batches)
    .map((b) => b.count)
    .sum();

  if (batches.length === 0 && showEmptyState) {
    return (
      <P>
        <Icons.Info /> No ballots have been scanned
      </P>
    );
  }

  return (
    <Stats data-testid="batch-summary-stats">
      <StatCard>
        <Stat
          label="Total Batches"
          value={batches.length}
          testId="total-batches"
        />
      </StatCard>
      <StatCard>
        <Stat label="Total Sheets" value={sheetCount} testId="total-sheets" />
      </StatCard>
    </Stats>
  );
}
