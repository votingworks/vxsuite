import React, { useContext, useCallback } from 'react';
import { assert } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';

import { isElectionManagerAuth, printElement } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';
import { TestDeckTallyReport } from './test_deck_tally_report';
import { generateTestDeckBallots } from '../utils/election';
import { PrintButton } from './print_button';

export function FullTestDeckTallyReportButton(): JSX.Element {
  const { auth, electionDefinition, logger } = useContext(AppContext);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  assert(electionDefinition);
  const { election } = electionDefinition;

  const printFullTestDeckTallyReport = useCallback(async () => {
    try {
      const ballots = generateTestDeckBallots({ election });
      // Full test deck tallies should be 4 times that of a single test deck because
      // it counts scanning 2 test decks (BMD + HMPB) twice (VxScan + VxCentralScan)
      const fullTestDeckTallyReport = (
        <TestDeckTallyReport
          election={election}
          testDeckBallots={[...ballots, ...ballots, ...ballots, ...ballots]}
        />
      );

      await printElement(fullTestDeckTallyReport, { sides: 'one-sided' });
      await logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
        disposition: 'success',
        message: `User printed the full test deck tally report`,
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
        disposition: 'failure',
        message: `Error printing the full test deck tally report: ${error.message}`,
        result: 'User shown error.',
      });
    }
  }, [election, logger, userRole]);

  return (
    <PrintButton print={printFullTestDeckTallyReport}>
      Print Full Test Deck Tally Report
    </PrintButton>
  );
}
