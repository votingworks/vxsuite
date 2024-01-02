import React, {
  useContext,
  useCallback,
  useState,
  useMemo,
  useEffect,
} from 'react';
import { assert, assertDefined } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';

import { Button, printElement, printElementToPdf } from '@votingworks/ui';
import {
  generateTestDeckBallots,
  isElectionManagerAuth,
} from '@votingworks/utils';
import type { TallyReportResults } from '@votingworks/admin-backend';
import { AppContext } from '../contexts/app_context';
import { TestDeckTallyReport } from './test_deck_tally_report';
import { generateResultsFromTestDeckBallots } from '../utils/election';
import { generateDefaultReportFilename } from '../utils/save_as_pdf';
import { SaveFrontendFileModal, FileType } from './save_frontend_file_modal';
import { PrintButton } from './print_button';

export function FullTestDeckTallyReportButton(): JSX.Element {
  const { auth, electionDefinition, logger } = useContext(AppContext);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [fullTestDeckTallyReportResults, setFullTestDeckTallyReportResults] =
    useState<TallyReportResults>();
  assert(isElectionManagerAuth(auth));
  const userRole = auth.user.role;

  assert(electionDefinition);
  const { election } = electionDefinition;

  useEffect(() => {
    void (async () => {
      const hmpbBallots = generateTestDeckBallots({
        election,
        markingMethod: 'hand',
      });
      const bmdBallots = generateTestDeckBallots({
        election,
        markingMethod: 'machine',
      });
      const tallyReportResults = await generateResultsFromTestDeckBallots({
        electionDefinition,
        testDeckBallots: [
          ...hmpbBallots,
          ...hmpbBallots,
          ...bmdBallots,
          ...bmdBallots,
        ],
      });
      setFullTestDeckTallyReportResults(tallyReportResults);
    })();
  }, [election, electionDefinition]);

  // Full test deck tallies should be 4 times that of a single test deck because
  // it counts scanning 2 test decks (BMD + HMPB) twice (VxScan + VxCentralScan)
  const fullTestDeckTallyReport = useMemo(() => {
    if (!fullTestDeckTallyReportResults) return undefined;

    return (
      <TestDeckTallyReport
        electionDefinition={electionDefinition}
        tallyReportResults={fullTestDeckTallyReportResults}
      />
    );
  }, [electionDefinition, fullTestDeckTallyReportResults]);

  const printFullTestDeckTallyReport = useCallback(async () => {
    assert(fullTestDeckTallyReport);
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
    await logger.log(LogEventId.TestDeckTallyReportSavedToPdf, userRole, {
      disposition: 'na',
      message: 'User attempted to save full test deck tally report to PDF',
    });
    setIsSaveModalOpen(true);
  }, [logger, userRole]);

  const defaultReportFilename = generateDefaultReportFilename(
    'full-test-deck-tally-report',
    election
  );

  return (
    <React.Fragment>
      <PrintButton
        print={printFullTestDeckTallyReport}
        disabled={!fullTestDeckTallyReport}
      >
        Print Full Test Deck Tally Report
      </PrintButton>{' '}
      {window.kiosk && (
        <Button
          onPress={onClickSaveFullTestDeckTallyReportToPdf}
          disabled={!fullTestDeckTallyReport}
        >
          Save Full Test Deck Tally Report as PDF
        </Button>
      )}
      {isSaveModalOpen && (
        <SaveFrontendFileModal
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() =>
            printElementToPdf(assertDefined(fullTestDeckTallyReport))
          }
          defaultFilename={defaultReportFilename}
          fileType={FileType.TestDeckTallyReport}
        />
      )}
    </React.Fragment>
  );
}
