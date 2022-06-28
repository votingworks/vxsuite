import React, { useContext, useCallback } from 'react';
import { assert, tallyVotesByContest } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import { Tally, VotingMethod } from '@votingworks/types';

import { isAdminAuth } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';
import { PrintButton } from './print_button';
import { TestDeckTallyReport } from './test_deck_tally_report';
import { generateTestDeckBallots } from '../utils/election';

export function FullTestDeckTallyReportButton(): JSX.Element {
  const { auth, electionDefinition, logger } = useContext(AppContext);
  assert(isAdminAuth(auth));
  const userRole = auth.user.role;

  assert(electionDefinition);
  const { election } = electionDefinition;

  const ballots = generateTestDeckBallots({ election });
  const votes = ballots.map((b) => b.votes);

  // Full test deck tally is 4 times a single test deck tally, because it counts scanning
  // 2 test decks (BMD + HMPB) in 2 places (VxScan + VxCentralScan)
  const testDeckTally: Tally = {
    numberOfBallotsCounted: ballots.length * 4,
    castVoteRecords: new Set(),
    contestTallies: tallyVotesByContest({
      election,
      votes: [...votes, ...votes, ...votes, ...votes],
    }),
    ballotCountsByVotingMethod: { [VotingMethod.Unknown]: ballots.length },
  };

  const afterPrint = useCallback(() => {
    void logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
      disposition: 'success',
      message: `User printed the full test deck tally report`,
    });
  }, [logger, userRole]);

  const afterPrintError = useCallback(
    (errorMessage: string) => {
      void logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
        disposition: 'failure',
        errorMessage,
        message: `Error printing the full test deck tally report: ${errorMessage}`,
        result: 'User shown error.',
      });
    },
    [logger, userRole]
  );

  const fullTestDeckTallyReport = (
    <TestDeckTallyReport election={election} electionTally={testDeckTally} />
  );

  return (
    <PrintButton
      afterPrint={afterPrint}
      afterPrintError={afterPrintError}
      sides="one-sided"
      printTarget={fullTestDeckTallyReport}
      printTargetTestId="full-test-deck-tally-report"
    >
      Print Full Test Deck Tally Report
    </PrintButton>
  );
}
