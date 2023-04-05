import React from 'react';
import { Admin } from '@votingworks/api';
import pluralize from 'pluralize';
import { ballotModeToReadableString } from '../config/types';

interface Props {
  ballotCopies: number;
  ballotMode: Admin.BallotMode;
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
