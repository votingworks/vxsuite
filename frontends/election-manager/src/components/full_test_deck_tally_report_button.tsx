import React, { useContext, useCallback } from 'react';
import { assert } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { isElectionManagerAuth } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';
import { PrintButton } from './print_button';
import { TestDeckTallyReport } from './test_deck_tally_report';
import { generateTestDeckBallots } from '../utils/election';

export function FullTestDeckTallyReportButton(): JSX.Element {
  const { auth, electionDefinition, logger } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  assert(electionDefinition);
  const { election } = electionDefinition;

  const ballots = generateTestDeckBallots({ election });
  const votes = ballots.map((b) => b.votes);

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

  // Full test deck tallies should be 4 times that of a single test deck because
  // it counts scanning 2 test decks (BMD + HMPB) twice (VxScan + VxCentralScan)
  const fullTestDeckTallyReport = (
    <TestDeckTallyReport
      election={election}
      votes={[...votes, ...votes, ...votes, ...votes]}
    />
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
