import React, { useContext, useEffect, useState, useMemo } from 'react';
import styled from 'styled-components';
import { useLocation, useParams } from 'react-router-dom';
import {
  assert,
  find,
  filterTalliesByParamsAndBatchId,
} from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import { VotingMethod, getLabelForVotingMethod } from '@votingworks/types';
import {
  Button,
  isElectionManagerAuth,
  Modal,
  printElement,
  printElementToPdf,
  Prose,
  TallyReportMetadata,
  Text,
} from '@votingworks/ui';
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
import { useMarkResultsOfficialMutation } from '../hooks/use_mark_results_official_mutation';
import { useWriteInSummaryQuery } from '../hooks/use_write_in_summary_query';

import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';
import { ElectionManagerTallyReport } from '../components/election_manager_tally_report';
import { getScreenAdjudicatedWriteInCounts } from '../utils/write_ins';
import { PrintButton } from '../components/print_button';

const TallyReportPreview = styled.div`
  section {
    margin: 1rem 0 2rem;
    background: #ffffff;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

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
    castVoteRecordFiles,
    electionDefinition,
    isOfficialResults,
    fullElectionTally,
    fullElectionExternalTallies,
    isTabulationRunning,
    auth,
    logger,
  } = useContext(AppContext);
  const markResultsOfficialMutation = useMarkResultsOfficialMutation();
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.
  const userRole = auth.user.role;
  const writeInSummaryQuery = useWriteInSummaryQuery({ status: 'adjudicated' });
  const screenAdjudicatedOfficialCandidateWriteInCounts =
    getScreenAdjudicatedWriteInCounts(writeInSummaryQuery.data ?? [], true);

  const location = useLocation();

  const { election } = electionDefinition;
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

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
      fullElectionExternalTallies={fullElectionExternalTallies}
      fullElectionTally={fullElectionTally}
      officialCandidateWriteIns={
        screenAdjudicatedOfficialCandidateWriteInCounts
      }
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
  async function markOfficial() {
    setIsMarkOfficialModalOpen(false);
    await markResultsOfficialMutation.mutateAsync();
  }

  if (isTabulationRunning) {
    return (
      <NavigationScreen centerChild>
        <Prose textCenter>
          <h1>Building Tabulation Report...</h1>
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
      <NavigationScreen>
        <Prose>
          <h1>{reportDisplayTitle}</h1>
          <TallyReportMetadata
            generatedAtTime={generatedAtTime}
            election={election}
          />
          <p>
            <PrintButton primary print={printTallyReport}>
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
                disabled={!castVoteRecordFiles.wereAdded || isOfficialResults}
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
                Have all CVR and external results files been loaded? Once
                results are marked as official, no additional CVR or external
                files can be loaded.
              </p>
              <p>Have all unofficial tally reports been reviewed?</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button primary onPress={markOfficial}>
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
