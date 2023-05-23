import React, { useContext, useEffect, useState, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  filterTalliesByParamsAndBatchId,
  isElectionManagerAuth,
} from '@votingworks/utils';
import { assert, find } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  VotingMethod,
  getLabelForVotingMethod,
  getPrecinctById,
} from '@votingworks/types';
import {
  Button,
  LinkButton,
  Modal,
  printElement,
  printElementToPdf,
  Prose,
  TallyReportMetadata,
  TallyReportPreview,
  Text,
} from '@votingworks/ui';
import { UseQueryResult } from '@tanstack/react-query';
import type { WriteInSummaryEntryAdjudicated } from '@votingworks/admin-backend';
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

import { routerPaths } from '../router_paths';

import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';
import { ElectionManagerTallyReport } from '../components/election_manager_tally_report';
import {
  getInvalidWriteInCounts,
  getOfficialCandidateScreenAdjudicatedWriteInCounts,
} from '../utils/write_ins';
import { PrintButton } from '../components/print_button';
import {
  getCastVoteRecordFileMode,
  getWriteInSummary,
  markResultsOfficial,
} from '../api';

export function TallyReportScreen(): JSX.Element {
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isMarkOfficialModalOpen, setIsMarkOfficialModalOpen] = useState(false);
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
    fullElectionManualTally,
    isTabulationRunning,
    auth,
    logger,
  } = useContext(AppContext);
  const markResultsOfficialMutation = markResultsOfficial.useMutation();
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.
  const userRole = auth.user.role;
  const writeInSummaryQuery = getWriteInSummary.useQuery({
    status: 'adjudicated',
  }) as UseQueryResult<WriteInSummaryEntryAdjudicated[]>;

  const screenAdjudicatedOfficialCandidateWriteInCounts =
    getOfficialCandidateScreenAdjudicatedWriteInCounts(
      writeInSummaryQuery.data ?? []
    );
  const invalidWriteInCounts = getInvalidWriteInCounts(
    writeInSummaryQuery.data ?? []
  );

  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();

  const location = useLocation();

  const { election } = electionDefinition;
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const precinctName = getPrecinctById({ election, precinctId })?.name;

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
      return `${statusPrefix} Precinct Tally Report for ${precinctName}`;
    }
    if (scannerId) {
      return `${statusPrefix} Scanner Tally Report for Scanner ${scannerId}`;
    }
    if (batchId) {
      return `${statusPrefix} Batch Tally Report for ${batchLabel}`;
    }
    if (precinctId === 'all') {
      return `${statusPrefix} ${election.title} Tally Reports for All Precincts`;
    }
    if (partyId) {
      const party = find(election.parties, (p) => p.id === partyId);
      return `${statusPrefix} Tally Report for ${party.fullName}`;
    }
    if (votingMethod) {
      const label = getLabelForVotingMethod(votingMethod);
      return `${statusPrefix} ${label} Ballot Tally Report`;
    }
    return `${statusPrefix} ${election.title} Tally Report`;
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
  const tallyReport = (
    <ElectionManagerTallyReport
      batchId={batchId}
      batchLabel={batchLabel}
      election={election}
      fullElectionManualTally={fullElectionManualTally}
      fullElectionTally={fullElectionTally}
      officialCandidateWriteIns={
        screenAdjudicatedOfficialCandidateWriteInCounts
      }
      invalidWriteIns={invalidWriteInCounts}
      generatedAtTime={generatedAtTime}
      tallyReportType={isOfficialResults ? 'Official' : 'Unofficial'}
      partyId={partyId}
      precinctId={precinctId}
      scannerId={scannerId}
      votingMethod={votingMethod}
    />
  );

  useEffect(() => {
    void logger.log(LogEventId.TallyReportPreviewed, userRole, {
      message: `User previewed the ${reportDisplayTitle}.`,
      disposition: 'success',
      tallyReportTitle: reportDisplayTitle,
    });
  }, [logger, reportDisplayTitle, userRole]);

  async function printTallyReport() {
    try {
      await printElement(tallyReport, { sides: 'one-sided' });
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

  function closeMarkOfficialModal() {
    setIsMarkOfficialModalOpen(false);
  }
  function openMarkOfficialModal() {
    setIsMarkOfficialModalOpen(true);
  }
  function markOfficial() {
    setIsMarkOfficialModalOpen(false);
    markResultsOfficialMutation.mutate();
  }

  if (isTabulationRunning) {
    return (
      <NavigationScreen centerChild title="Building Tabulation Report...">
        <Prose textCenter>
          <p>This may take a few seconds.</p>
        </Prose>
      </NavigationScreen>
    );
  }

  const defaultReportFilename = generateDefaultReportFilename(
    'tabulation-report',
    election,
    fileSuffix
  );

  return (
    <React.Fragment>
      <NavigationScreen title={reportDisplayTitle}>
        <Prose>
          <TallyReportMetadata
            generatedAtTime={generatedAtTime}
            election={election}
          />
          <p>
            <PrintButton variant="primary" print={printTallyReport}>
              Print Report
            </PrintButton>{' '}
            {window.kiosk && (
              <Button onPress={() => setIsSaveModalOpen(true)}>
                Save Report as PDF
              </Button>
            )}
          </p>
          {location.pathname === routerPaths.tallyFullReport && (
            <p>
              <Button
                disabled={
                  !castVoteRecordFileModeQuery.isSuccess ||
                  castVoteRecordFileModeQuery.data === 'unlocked' ||
                  isOfficialResults
                }
                onPress={openMarkOfficialModal}
              >
                Mark Tally Results as Official
              </Button>
            </p>
          )}
          <p>
            <LinkButton small to={routerPaths.reports}>
              Back to Reports
            </LinkButton>
          </p>
          <React.Fragment>
            <h2>Report Preview</h2>
            <Text italic small>
              <strong>Note:</strong> Printed reports may be paginated to more
              than one piece of paper.
            </Text>
          </React.Fragment>
        </Prose>
        <TallyReportPreview data-testid="report-preview">
          {tallyReport}
        </TallyReportPreview>
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() => printElementToPdf(tallyReport)}
          defaultFilename={defaultReportFilename}
          fileType={FileType.TallyReport}
        />
      )}
      {isMarkOfficialModalOpen && (
        <Modal
          centerContent
          content={
            <Prose textCenter>
              <h1>Mark Unofficial Tally Results as Official Tally Results?</h1>
              <p>
                Have all CVR files been loaded? Once results are marked as
                official, no additional CVR files can be loaded.
              </p>
              <p>Have all unofficial tally reports been reviewed?</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={markOfficial}>
                Mark Tally Results as Official
              </Button>
              <Button onPress={closeMarkOfficialModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeMarkOfficialModal}
        />
      )}
    </React.Fragment>
  );
}
