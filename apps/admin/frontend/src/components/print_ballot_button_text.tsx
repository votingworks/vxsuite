import React from 'react';
import pluralize from 'pluralize';
import type { BallotMode } from '@votingworks/admin-backend';
import { ballotModeToReadableString } from '../config/types';

interface Props {
  ballotCopies: number;
  ballotMode: BallotMode;
  isAbsentee: boolean;
}

export function PrintBallotButtonText({
  ballotCopies,
  ballotMode,
  isAbsentee,
}: Props): JSX.Element {
  return (
    <span>
      Print {ballotCopies}{' '}
      <strong>
        {ballotModeToReadableString(ballotMode)}{' '}
        {isAbsentee ? 'Absentee' : 'Precinct'}
      </strong>{' '}
      {pluralize('Ballot', ballotCopies)}
    </span>
  );
}
