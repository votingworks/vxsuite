import React from 'react';
import {
  BallotLocales,
  Election,
  getElectionLocales,
} from '@votingworks/types';
import pluralize from 'pluralize';
import { DEFAULT_LOCALE } from '../config/globals';
import { BallotMode, ballotModeToReadableString } from '../config/types';
import { getHumanBallotLanguageFormat } from '../utils/election';

interface Props {
  ballotCopies: number;
  ballotMode: BallotMode;
  isAbsentee: boolean;
  election: Election;
  localeCode?: string;
}

export function PrintBallotButtonText({
  ballotCopies,
  ballotMode,
  isAbsentee,
  election,
  localeCode,
}: Props): JSX.Element {
  const locales: BallotLocales = {
    primary: DEFAULT_LOCALE,
    secondary: localeCode,
  };
  const availableLocaleCodes = getElectionLocales(election, DEFAULT_LOCALE);
  return (
    <span>
      Print {ballotCopies}{' '}
      <strong>
        {ballotModeToReadableString(ballotMode)}{' '}
        {isAbsentee ? 'Absentee' : 'Precinct'}
      </strong>{' '}
      {pluralize('Ballot', ballotCopies)}
      {availableLocaleCodes.length > 1 &&
        localeCode &&
        ` in ${getHumanBallotLanguageFormat(locales)}`}
    </span>
  );
}
