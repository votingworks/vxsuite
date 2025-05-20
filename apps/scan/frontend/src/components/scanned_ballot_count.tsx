import { BigMetric, TextOnly, appStrings } from '@votingworks/ui';
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
      {/*
       * The screen reader currently only supports numbers up to ~130. Bumping
       * that up into the thousands would unnecessarily bloat the audio package.
       * Not useful for this UI element to be read out, so disabling audio here.
       */}
      <TextOnly>
        <BigMetric
          label={appStrings.labelNumSheetsScanned()}
          value={count}
          valueElementTestId="ballot-count"
        />
      </TextOnly>
    </BallotsScannedContainer>
  );
}
