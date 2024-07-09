import React from 'react';

import { assertDefined } from '@votingworks/basics';
import { PageInterpretationType } from '@votingworks/types';

import * as api from '../api';
import { ReinsertedNonBallotScreen } from './reinserted_non_ballot_screen';
import { ReinsertedWrongElectionBallotScreen } from './reinserted_wrong_election_ballot_screen';
import { ReinsertedWrongTestModeBallotScreen } from './reinserted_wrong_test_mode_ballot_screen';
import { ReinsertedWrongPrecinctBallotScreen } from './reinserted_wrong_precinct_ballot_screen';

const SCREENS: Readonly<
  Record<PageInterpretationType, JSX.Element | undefined>
> = {
  InterpretedBmdPage: undefined, // This page should be unreachable for this result.

  BlankPage: <ReinsertedNonBallotScreen />,
  InterpretedHmpbPage: <ReinsertedNonBallotScreen />,
  InvalidElectionHashPage: <ReinsertedWrongElectionBallotScreen />,
  InvalidPrecinctPage: <ReinsertedWrongPrecinctBallotScreen />,
  InvalidTestModePage: <ReinsertedWrongTestModeBallotScreen />,
  UnreadablePage: <ReinsertedNonBallotScreen />,
};

export function ReinsertedInvalidBallotScreen(): React.ReactNode {
  const interpretationQuery = api.getInterpretation.useQuery();

  if (!interpretationQuery.isSuccess) {
    return null;
  }

  const interpretationType = assertDefined(interpretationQuery.data).type;
  const screen = assertDefined(
    SCREENS[interpretationType],
    `unexpected interpretation type: ${interpretationType}`
  );

  return screen;
}
