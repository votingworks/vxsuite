import React, { useContext, useEffect, useState, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getRelevantContests, isElectionManagerAuth } from '@votingworks/utils';
import { assert, assertDefined, find } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  Button,
  Caption,
  Font,
  H2,
  Icons,
  LinkButton,
  Modal,
  P,
  printElement,
  printElementToPdf,
  TallyReportMetadata,
  TallyReportPreview,
} from '@votingworks/ui';
import { Tabulation, electionHasPrimaryContest } from '@votingworks/types';
import { generateDefaultReportFilename } from '../utils/save_as_pdf';

import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';

import { routerPaths } from '../router_paths';

import {
  SaveFrontendFileModal,
  FileType,
} from '../components/save_frontend_file_modal';
import { PrintButton } from '../components/print_button';
import {
  getCastVoteRecordFileMode,
  getResultsForTallyReports,
  getScannerBatches,
  markResultsOfficial,
} from '../api';
import { Loading } from '../components/loading';
import { AdminTallyReportByParty } from '../components/admin_tally_report_by_party';
import {
  BatchReportScreenProps,
  PartyReportScreenProps,
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
  VotingMethodReportScreenProps,
} from '../config/types';

interface BaseTallyReportScreenProps {
  report?: JSX.Element;
  generatedAtTime?: Date;
  title: string;
  fileSuffix: string;
}

function BaseTallyReportScreen({
  report,
  title,
  fileSuffix,
  generatedAtTime,
}: BaseTallyReportScreenProps): JSX.Element {
  const { electionDefinition, isOfficialResults, auth, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.
  const userRole = auth.user.role;
  const { election } = electionDefinition;

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isMarkOfficialModalOpen, setIsMarkOfficialModalOpen] = useState(false);

  const markResultsOfficialMutation = markResultsOfficial.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();

  const location = useLocation();

  useEffect(() => {
    void logger.log(LogEventId.TallyReportPreviewed, userRole, {
      message: `User previewed the ${title}.`,
      disposition: 'success',
      tallyReportTitle: title,
    });
  }, [logger, title, userRole]);

  async function printTallyReport() {
    assert(report); // printing should only be available if the report loaded
    try {
      await printElement(report, { sides: 'one-sided' });
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `User printed ${title}`,
        disposition: 'success',
        tallyReportTitle: title,
      });
    } catch (error) {
      assert(error instanceof Error);
      await logger.log(LogEventId.TallyReportPrinted, userRole, {
        message: `Error in attempting to print ${title}: ${error.message}`,
        disposition: 'failure',
        tallyReportTitle: title,
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

  if (!castVoteRecordFileModeQuery.isSuccess) {
    return (
      <NavigationScreen title={title}>
        <Loading />
      </NavigationScreen>
    );
  }

  const defaultReportFilename = generateDefaultReportFilename(
    'tabulation-report',
    election,
    fileSuffix
  );
  const canMarkResultsOfficial =
    castVoteRecordFileModeQuery.data !== 'unlocked' &&
    !isOfficialResults &&
    report;

  return (
    <React.Fragment>
      <NavigationScreen title={title}>
        <TallyReportMetadata
          generatedAtTime={generatedAtTime}
          election={election}
        />
        <P>
          <PrintButton
            variant="primary"
            print={printTallyReport}
            disabled={!report}
          >
            Print Report
          </PrintButton>{' '}
          {window.kiosk && (
            <Button onPress={() => setIsSaveModalOpen(true)} disabled={!report}>
              Save Report as PDF
            </Button>
          )}
        </P>
        {location.pathname === routerPaths.tallyFullReport && (
          <P>
            <Button
              disabled={!canMarkResultsOfficial}
              onPress={openMarkOfficialModal}
            >
              Mark Tally Results as Official
            </Button>
          </P>
        )}
        <P>
          <LinkButton small to={routerPaths.reports}>
            Back to Reports
          </LinkButton>
        </P>
        <H2>Report Preview</H2>
        <Caption>
          <Icons.Info /> <Font weight="bold">Note:</Font> Printed reports may be
          paginated to more than one piece of paper.
        </Caption>
        <TallyReportPreview data-testid="report-preview">
          {report ?? <Loading>Generating Report</Loading>}
        </TallyReportPreview>
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFrontendFileModal
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={() => printElementToPdf(assertDefined(report))}
          defaultFilename={defaultReportFilename}
          fileType={FileType.TallyReport}
        />
      )}
      {isMarkOfficialModalOpen && (
        <Modal
          title="Mark Unofficial Tally Results as Official Tally Results?"
          content={
            <React.Fragment>
              <P>
                Have all CVR files been loaded? Once results are marked as
                official, no additional CVR files can be loaded.
              </P>
              <P>Have all unofficial tally reports been reviewed?</P>
            </React.Fragment>
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

function SingleTallyReportScreen({
  title,
  fileSuffix,
  filter,
}: {
  title?: string;
  fileSuffix: string;
  filter: Tabulation.Filter;
}): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const reportResultsQuery = getResultsForTallyReports.useQuery({
    filter,
    groupBy: electionHasPrimaryContest(election)
      ? { groupByParty: true }
      : undefined,
  });

  const report = useMemo(() => {
    if (!reportResultsQuery.data) {
      return undefined;
    }

    return (
      <AdminTallyReportByParty
        election={election}
        key="tally-report"
        testId="tally-report"
        title={title}
        contests={getRelevantContests({ election, filter })}
        tallyReportResults={reportResultsQuery.data}
        tallyReportType={isOfficialResults ? 'Official' : 'Unofficial'}
        generatedAtTime={new Date(reportResultsQuery.dataUpdatedAt)}
      />
    );
  }, [
    election,
    filter,
    isOfficialResults,
    reportResultsQuery.data,
    reportResultsQuery.dataUpdatedAt,
    title,
  ]);

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  return BaseTallyReportScreen({
    title: title
      ? `${statusPrefix} ${title}`
      : `${statusPrefix} ${election.title} Tally Report`,
    fileSuffix,
    report,
    generatedAtTime: report
      ? new Date(reportResultsQuery.dataUpdatedAt)
      : undefined,
  });
}

export function PrecinctTallyReportScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const { precinctId } = useParams<PrecinctReportScreenProps>();
  const precinct = find(election.precincts, (p) => p.id === precinctId);

  return SingleTallyReportScreen({
    filter: { precinctIds: [precinctId] },
    fileSuffix: `precinct-${precinctId}}`,
    title: `Precinct Tally Report for ${precinct.name}`,
  });
}

export function ScannerTallyReportScreen(): JSX.Element {
  const { scannerId } = useParams<ScannerReportScreenProps>();
  return SingleTallyReportScreen({
    filter: { scannerIds: [scannerId] },
    fileSuffix: `scanner-${scannerId}`,
    title: `Scanner Tally Report for Scanner ${scannerId}`,
  });
}

export function VotingMethodTallyReportScreen(): JSX.Element {
  const { votingMethod } = useParams<VotingMethodReportScreenProps>();
  const votingMethodLabel =
    votingMethod.slice(0, 1).toUpperCase() + votingMethod.slice(1);
  return SingleTallyReportScreen({
    filter: { votingMethods: [votingMethod as Tabulation.VotingMethod] },
    fileSuffix: `${votingMethod}-ballots`,
    title: `${votingMethodLabel} Ballot Tally Report`,
  });
}

export function BatchTallyReportScreen(): JSX.Element {
  const { batchId } = useParams<BatchReportScreenProps>();

  const scannerBatchQuery = getScannerBatches.useQuery();
  const batch = scannerBatchQuery.data
    ? find(scannerBatchQuery.data, (b) => b.batchId === batchId)
    : undefined;
  const title = batch
    ? `Batch Tally Report for ${batch.label}`
    : `Batch Tally Report`;

  return SingleTallyReportScreen({
    filter: { batchIds: [batchId] },
    fileSuffix: `batch-${batchId}`,
    title,
  });
}

export function PartyTallyReportScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const { partyId } = useParams<PartyReportScreenProps>();
  const party = find(election.parties, (p) => p.id === partyId);

  return SingleTallyReportScreen({
    filter: { partyIds: [partyId] },
    fileSuffix: `party-${partyId}`,
    title: `${party.fullName} Tally Report`,
  });
}

export function FullElectionTallyReportScreen(): JSX.Element {
  return SingleTallyReportScreen({
    filter: {},
    fileSuffix: `full-election`,
  });
}

export function AllPrecinctsTallyReportScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  assert(electionDefinition);
  const { election } = electionDefinition;

  const reportResultsQuery = getResultsForTallyReports.useQuery({
    groupBy: {
      groupByPrecinct: true,
      groupByParty: electionHasPrimaryContest(election),
    },
  });

  const report = useMemo(() => {
    if (!reportResultsQuery.data) {
      return undefined;
    }

    const precinctReports: JSX.Element[] = [];
    for (const precinct of election.precincts) {
      precinctReports.push(
        <AdminTallyReportByParty
          election={election}
          key={`tally-report-${precinct.id}`}
          testId={`tally-report-${precinct.id}`}
          title={`Precinct Tally Report for ${precinct.name}`}
          contests={getRelevantContests({
            election,
            filter: { precinctIds: [precinct.id] },
          })}
          tallyReportResults={reportResultsQuery.data.filter(
            (results) => results.precinctId === precinct.id
          )}
          tallyReportType={isOfficialResults ? 'Official' : 'Unofficial'}
          generatedAtTime={new Date(reportResultsQuery.dataUpdatedAt)}
        />
      );
    }

    return <React.Fragment>{precinctReports}</React.Fragment>;
  }, [
    election,
    isOfficialResults,
    reportResultsQuery.data,
    reportResultsQuery.dataUpdatedAt,
  ]);

  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  return BaseTallyReportScreen({
    title: `${statusPrefix} All Precincts Tally Report`,
    fileSuffix: 'all-precincts',
    report,
    generatedAtTime: report
      ? new Date(reportResultsQuery.dataUpdatedAt)
      : undefined,
  });
}
