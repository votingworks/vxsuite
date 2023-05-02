import React from 'react';
import {
  Button,
  SegmentedButtonDeprecated as SegmentedButton,
} from '@votingworks/ui';
import type { BallotMode } from '@votingworks/admin-backend';

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
        disabled={ballotMode === 'official'}
        onPress={() => setBallotMode('official')}
        small
      >
        Official
      </Button>
      <Button
        disabled={ballotMode === 'test'}
        onPress={() => setBallotMode('test')}
        small
      >
        Test
      </Button>
      <Button
        disabled={ballotMode === 'sample'}
        onPress={() => setBallotMode('sample')}
        small
      >
        Sample
      </Button>
    </SegmentedButton>
  );
}
