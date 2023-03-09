import React from 'react';
import { BigMetric } from '@votingworks/ui';
import styled from 'styled-components';

interface Props {
  count: number;
}

const BallotsScannedContainer = styled.div`
  display: inline-block;
  padding: 0.125rem 0.25rem;
`;

export function ScannedBallotCount({ count }: Props): JSX.Element {
  return (
    <BallotsScannedContainer>
      <BigMetric align="center" label="Ballots Scanned" value={count} />
    </BallotsScannedContainer>
  );
}
