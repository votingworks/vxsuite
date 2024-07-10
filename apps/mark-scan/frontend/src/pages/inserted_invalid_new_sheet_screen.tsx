import { assertDefined } from '@votingworks/basics';
import { PageInterpretationType } from '@votingworks/types';

import * as api from '../api';
import { InsertedWrongElectionBallotScreen } from './inserted_wrong_election_ballot_screen';
import { InsertedWrongPrecinctBallotScreen } from './inserted_wrong_precinct_ballot_screen';
import { InsertedWrongTestModeBallotScreen } from './inserted_wrong_test_mode_ballot_screen';
import { InsertedUnreadableBallotScreen } from './inserted_unreadable_ballot_screen';

const SCREENS: Readonly<
  Record<PageInterpretationType, JSX.Element | undefined>
> = {
  InterpretedBmdPage: undefined, // This page should be unreachable for this result.
  BlankPage: undefined, // This page should be unreachable for this result.

  // Not currently reachable in practice - HMPBs are interpreted as `BlankPage`s
  // in VxMarkScan:
  InterpretedHmpbPage: <InsertedUnreadableBallotScreen />,

  InvalidElectionHashPage: <InsertedWrongElectionBallotScreen />,
  InvalidTestModePage: <InsertedWrongTestModeBallotScreen />,
  InvalidPrecinctPage: <InsertedWrongPrecinctBallotScreen />,
  UnreadablePage: <InsertedUnreadableBallotScreen />,
};

export function InsertedInvalidNewSheetScreen(): React.ReactNode {
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
