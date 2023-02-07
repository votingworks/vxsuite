import React from 'react';
import { Admin } from '@votingworks/api';
import { BallotLocale, Election, getElectionLocales } from '@votingworks/types';
import pluralize from 'pluralize';
import { DEFAULT_LOCALE } from '../config/globals';
import { ballotModeToReadableString } from '../config/types';
import { getHumanBallotLanguageFormat } from '../utils/election';

interface Props {
  ballotCopies: number;
  ballotMode: Admin.BallotMode;
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
  const locales: BallotLocale = {
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
