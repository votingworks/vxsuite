import React from 'react';
import { Callout, Font, Icons, P } from '@votingworks/ui';
import styled from 'styled-components';
import { iter } from '@votingworks/basics';
import type { ScanStatus } from '@votingworks/central-scan-backend';
import { format } from '@votingworks/utils';

const StatLines = styled.div`
  p {
    margin-bottom: 0.25rem;
    font-size: 1.4rem;
  }
`;

const StatCallout = styled(Callout)`
  div {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    gap: 2rem;
  }

  p {
    margin-bottom: 0;
  }
`;

export function BatchSummaryStats({
  status,
  callout,
}: {
  status: ScanStatus;
  /** Renders as a compact callout row instead of large stacked lines. */
  callout?: boolean;
}): JSX.Element {
  // the open batch isn't included in the saved counts
  const batches = status.batches.filter(
    (b) => b.id !== status.currentBatch?.batchId
  );
  const batchCount = batches.length;
  const ballotCount = iter(batches)
    .map((b) => b.count)
    .sum();

  if (batchCount === 0) {
    return (
      <P>
        <Icons.Info /> No batches have been saved
      </P>
    );
  }

  const stats = (
    <React.Fragment>
      <P>
        <Font weight="bold">Total Batches:</Font> {format.count(batchCount)}
      </P>
      <P>
        <Font weight="bold">Total Sheets:</Font> {format.count(ballotCount)}
      </P>
    </React.Fragment>
  );

  if (callout) {
    return (
      <StatCallout color="neutral" style={{ gap: '3rem' }}>
        {stats}
      </StatCallout>
    );
  }
  return <StatLines>{stats}</StatLines>;
}
