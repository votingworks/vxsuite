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
  border-width: ${(p) => p.theme.sizes.bordersRem.hairline}rem;
`;

const StatLabel = styled.div`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

const StatValue = styled.div`
  font-size: 1.8rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 1;
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
  /**
   * When there are no saved batches, show a "no batches" message instead of
   * stat cards reading zero (used where the stats stand alone, e.g. the batch
   * history page).
   */
  showEmptyState?: boolean;
}): JSX.Element {
  // the open batch isn't included in the saved counts
  const batches = status.batches.filter(
    (b) => b.id !== status.currentBatch?.batchId
  );
  const batchCount = batches.length;
  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();

  if (batchCount === 0 && showEmptyState) {
    return (
      <P>
        <Icons.Info /> No batches have been saved
      </P>
    );
  }

  return (
    <Stats data-testid="batch-summary-stats">
      <StatCard>
        <Stat label="Total Batches" value={batchCount} testId="total-batches" />
      </StatCard>
      <StatCard>
        <Stat label="Total Sheets" value={ballotCount} testId="total-sheets" />
      </StatCard>
    </Stats>
  );
}
