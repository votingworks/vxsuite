import React from 'react';
import { Button, SegmentedButton } from '@votingworks/shared-frontend';
import { Admin } from '@votingworks/api';

interface Props {
  ballotMode: Admin.BallotMode;
  setBallotMode: (ballotMode: Admin.BallotMode) => void;
}

export function BallotModeToggle({
  ballotMode,
  setBallotMode,
}: Props): JSX.Element {
  return (
    <SegmentedButton>
      <Button
        disabled={ballotMode === Admin.BallotMode.Official}
        onPress={() => setBallotMode(Admin.BallotMode.Official)}
        small
      >
        Official
      </Button>
      <Button
        disabled={ballotMode === Admin.BallotMode.Test}
        onPress={() => setBallotMode(Admin.BallotMode.Test)}
        small
      >
        Test
      </Button>
      <Button
        disabled={ballotMode === Admin.BallotMode.Sample}
        onPress={() => setBallotMode(Admin.BallotMode.Sample)}
        small
      >
        Sample
      </Button>
    </SegmentedButton>
  );
}
