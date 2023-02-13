import React, { useContext, useState, useMemo } from 'react';

import { useParams } from 'react-router-dom';
import { filterTalliesByParamsAndBatchId } from '@votingworks/utils';
import { assert, find } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  VotingMethod,
  getLabelForVotingMethod,
  ExternalTallySourceType,
} from '@votingworks/types';
import {
  isElectionManagerAuth,
  Prose,
  TallyReportPreview,
  TallyReportMetadata,
  Text,
  Button,
  printElement,
  printElementToPdf,
} from '@votingworks/shared-frontend';
import { generateDefaultReportFilename } from '../utils/save_as_pdf';

import {
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
  PartyReportScreenProps,
  BatchReportScreenProps,
  VotingMethodReportScreenProps,
} from '../config/types';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { LinkButton } from '../components/link_button';

import { routerPaths } from '../router_paths';

import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';
import { ElectionManagerWriteInTallyReport } from '../components/election_manager_writein_tally_report';

import { useWriteInSummaryQuery } from '../hooks/use_write_in_summary_query';
import {
  getManualWriteInCounts,
  getScreenAdjudicatedWriteInCounts,
  writeInCountsAreEmpty,
} from '../utils/write_ins';
import { PrintButton } from '../components/print_button';

export function TallyWriteInReportScreen(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const { precinctId } = useParams<PrecinctReportScreenProps>();
  const { scannerId } = useParams<ScannerReportScreenProps>();
  const { batchId } = useParams<BatchReportScreenProps>();
  const { partyId } = useParams<PartyReportScreenProps>();
  const { votingMethod: votingMethodFromProps } =
    useParams<VotingMethodReportScreenProps>();
  const votingMethod = votingMethodFromProps as VotingMethod;
  const {
    electionDefinition,
    isOfficialResults,
    fullElectionTally,
    fullElectionExternalTallies,
    isTabulationRunning,
    auth,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.
  const userRole = auth.user.role;

  const { election } = electionDefinition;
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';
  const writeInSummaryQuery = useWriteInSummaryQuery({ status: 'adjudicated' });
  const screenAdjudicatedWriteInCounts = getScreenAdjudicatedWriteInCounts(
    writeInSummaryQuery.data ?? []
  );
  const manualData = fullElectionExternalTallies.get(
    ExternalTallySourceType.Manual
  );
  const manualWriteInCounts = manualData
    ? getManualWriteInCounts(manualData.overallTally)
    : undefined;

  const precinctName =
    (precinctId &&
      precinctId !== 'all' &&
      find(election.precincts, (p) => p.id === precinctId).name) ||
    undefined;

  const fileSuffix = useMemo(() => {
    if (scannerId) {
      return `scanner-${scannerId}`;
    }
    if (batchId) {
      return `batch-${batchId}`;
    }
    if (precinctId === 'all') {
      return 'all-precincts';
    }
    if (partyId) {
      const party = find(election.parties, (p) => p.id === partyId);
      return party.fullName;
    }
    if (votingMethod) {
      const label = getLabelForVotingMethod(votingMethod);
      return `${label}-ballots`;
    }
    return precinctName;
  }, [
    batchId,
    scannerId,
    precinctId,
    votingMethod,
    partyId,
    election.parties,
    precinctName,
  ]);
  const batchLabel = useMemo(() => {
    if (batchId) {
      assert(fullElectionTally);
      const batchTally = filterTalliesByParamsAndBatchId(
        fullElectionTally,
        election,
        batchId,
        {}
      );
      return `${batchTally.batchLabel} (Scanner: ${batchTally.scannerIds.join(
        ', '
      )})`;
    }
    return '';
  }, [batchId, fullElectionTally, election]);
  const reportDisplayTitle = useMemo(() => {
    if (precinctName) {
      return `${statusPrefix} Precinct Write-In Tally Report for ${precinctName}`;
    }
    if (scannerId) {
      return `${statusPrefix} Scanner Write-In Tally Report for Scanner ${scannerId}`;
    }
    if (batchId) {
      return `${statusPrefix} Batch Write-In Tally Report for ${batchLabel}`;
    }
    if (precinctId === 'all') {
      return `${statusPrefix} ${election.title} Write-In Tally Reports for All Precincts`;
    }
    if (partyId) {
      const party = find(election.parties, (p) => p.id === partyId);
      return `${statusPrefix} Write-In Tally Report for ${party.fullName}`;
    }
    if (votingMethod) {
      const label = getLabelForVotingMethod(votingMethod);
      return `${statusPrefix} ${label} Ballot Write-In Tally Report`;
    }
    return `${statusPrefix} ${election.title} Write-In Tally Report`;
  }, [
    batchId,
    scannerId,
    precinctId,
    votingMethod,
    partyId,
    batchLabel,
    statusPrefix,
    election,
    precinctName,
  ]);

  const generatedAtTime = new Date();

  const writeInTallyReport = (
    <ElectionManagerWriteInTallyReport
      batchId={batchId}
      batchLabel={batchLabel}
      election={election}
      screenAdjudicatedWriteInCounts={screenAdjudicatedWriteInCounts}
      manualWriteInCounts={manualWriteInCounts}
      generatedAtTime={generatedAtTime}
      isOfficialResults={isOfficialResults}
      partyId={partyId}
      precinctId={precinctId}
      scannerId={scannerId}
      votingMethod={votingMethod}
    />
  );

  async function printWriteInTallyReport() {
    try {
      await printElement(writeInTallyReport, {
        sides: 'one-sided',
      });
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `User printed ${reportDisplayTitle}`,
        disposition: 'success',
        tallyReportTitle: reportDisplayTitle,
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `Error in attempting to print ${reportDisplayTitle}: ${error.message}`,
        disposition: 'failure',
        tallyReportTitle: reportDisplayTitle,
        result: 'User shown error.',
      });
    }
  }

  const defaultReportFilename = generateDefaultReportFilename(
    'tabulation-writein-report',
    election,
    fileSuffix
  );

  if (isTabulationRunning || !screenAdjudicatedWriteInCounts) {
    return (
      <NavigationScreen centerChild>
        <Prose textCenter>
          <h1>Building Tabulation Report...</h1>
          <p>This may take a few seconds.</p>
        </Prose>
      </NavigationScreen>
    );
  }

  const isReportEmpty =
    writeInCountsAreEmpty(screenAdjudicatedWriteInCounts) &&
    (!manualWriteInCounts || writeInCountsAreEmpty(manualWriteInCounts));

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose>
          <h1>{reportDisplayTitle}</h1>
          {!isReportEmpty ? (
            <React.Fragment>
              <TallyReportMetadata
                generatedAtTime={generatedAtTime}
                election={election}
              />
              <p>
                <PrintButton print={printWriteInTallyReport} primary>
                  Print Report
                </PrintButton>{' '}
                {window.kiosk && (
                  <Button onPress={() => setIsSaveModalOpen(true)}>
                    Save Report as PDF
                  </Button>
                )}
              </p>
            </React.Fragment>
          ) : (
            <p>
              The Write-In Tally Report is currently empty because there are no
              write-in votes adjudicated to non-official candidates. Write-in
              votes adjudicated to official candidates are included in the Full
              Election Tally Report and not this report.
            </p>
          )}
          <p>
            <LinkButton small to={routerPaths.reports}>
              Back to Reports
            </LinkButton>
          </p>
          {!isReportEmpty && (
            <React.Fragment>
              <h2>Report Preview</h2>
              <Text italic small>
                <strong>Note:</strong> Printed reports may be paginated to more
                than one piece of paper.
              </Text>
            </React.Fragment>
          )}
        </Prose>
        <TallyReportPreview data-testid="report-preview">
          {writeInTallyReport}
        </TallyReportPreview>
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() => printElementToPdf(writeInTallyReport)}
          defaultFilename={defaultReportFilename}
          fileType={FileType.TallyReport}
        />
      )}
    </React.Fragment>
  );
}
