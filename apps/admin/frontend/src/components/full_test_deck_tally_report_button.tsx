import React, { useContext, useCallback, useState, useMemo } from 'react';
import { assert } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';

import { Button, printElement, printElementToPdf } from '@votingworks/ui';
import { isElectionManagerAuth } from '@votingworks/utils';
import { AppContext } from '../contexts/app_context';
import { TestDeckTallyReport } from './test_deck_tally_report';
import { generateTestDeckBallots } from '../utils/election';
import { generateDefaultReportFilename } from '../utils/save_as_pdf';
import { SaveFileToUsb, FileType } from './save_file_to_usb';
import { PrintButton } from './print_button';

export function FullTestDeckTallyReportButton(): JSX.Element {
  const { auth, electionDefinition, logger } = useContext(AppContext);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  assert(electionDefinition);
  const { election } = electionDefinition;

  const ballots = generateTestDeckBallots({ election });
  // Full test deck tallies should be 4 times that of a single test deck because
  // it counts scanning 2 test decks (BMD + HMPB) twice (VxScan + VxCentralScan)
  const fullTestDeckTallyReport = useMemo(
    () => (
      <TestDeckTallyReport
        election={election}
        testDeckBallots={[...ballots, ...ballots, ...ballots, ...ballots]}
      />
    ),
    [election, ballots]
  );

  const printFullTestDeckTallyReport = useCallback(async () => {
    try {
      await printElement(fullTestDeckTallyReport, { sides: 'one-sided' });
      await logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
        disposition: 'success',
        message: 'User printed the full test deck tally report',
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
        disposition: 'failure',
        message: `Error printing the full test deck tally report: ${error.message}`,
        result: 'User shown error.',
      });
    }
  }, [logger, userRole, fullTestDeckTallyReport]);

  const onClickSaveFullTestDeckTallyReportToPdf = useCallback(async () => {
    // TODO add new logging event
    await logger.log(LogEventId.TestDeckTallyReportPrinted, userRole, {
      disposition: 'na',
      message: 'User clicked "Save PDF"',
    });
    setIsSaveModalOpen(true);
  }, [logger, userRole]);

  const defaultReportFilename = generateDefaultReportFilename(
    'full-test-deck-tally-report',
    election
  );

  return (
    <React.Fragment>
      <PrintButton print={printFullTestDeckTallyReport}>
        Print Full Test Deck Tally Report
      </PrintButton>{' '}
      {window.kiosk && (
        <Button onPress={onClickSaveFullTestDeckTallyReportToPdf}>
          Save Full Test Deck Tally Report as PDF
        </Button>
      )}
      {isSaveModalOpen && (
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() => printElementToPdf(fullTestDeckTallyReport)}
          defaultFilename={defaultReportFilename}
          fileType={FileType.TestDeckTallyReport}
        />
      )}
    </React.Fragment>
  );
}
