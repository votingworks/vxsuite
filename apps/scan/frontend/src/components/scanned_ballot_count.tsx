import { BigMetric } from '@votingworks/ui';
import styled from 'styled-components';

interface Props {
  count: number;
}

const BallotsScannedContainer = styled.div`
  display: inline-block;
`;

export function ScannedBallotCount({ count }: Props): JSX.Element {
  return (
    <BallotsScannedContainer>
      <BigMetric
        label="Ballots Scanned"
        value={count}
        valueElementTestId="ballot-count"
      />
    </BallotsScannedContainer>
  );
}
