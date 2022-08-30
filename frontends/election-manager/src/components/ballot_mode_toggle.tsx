import React from 'react';
import { Button, SegmentedButton } from '@votingworks/ui';
import { BallotMode } from '../config/types';

interface Props {
  ballotMode: BallotMode;
  setBallotMode: (ballotMode: BallotMode) => void;
}

export function BallotModeToggle({
  ballotMode,
  setBallotMode,
}: Props): JSX.Element {
  return (
    <SegmentedButton>
      <Button
        disabled={ballotMode === BallotMode.Official}
        onPress={() => setBallotMode(BallotMode.Official)}
        small
      >
        Official
      </Button>
      <Button
        disabled={ballotMode === BallotMode.Test}
        onPress={() => setBallotMode(BallotMode.Test)}
        small
      >
        Test
      </Button>
      <Button
        disabled={ballotMode === BallotMode.Sample}
        onPress={() => setBallotMode(BallotMode.Sample)}
        small
      >
        Sample
      </Button>
    </SegmentedButton>
  );
}
