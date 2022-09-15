import React, { useContext, useEffect, useRef, useState, useMemo } from 'react';
import styled from 'styled-components';

import { useParams } from 'react-router-dom';
import { assert, find } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import {
  VotingMethod,
  getLabelForVotingMethod,
  ContestId,
} from '@votingworks/types';
import {
  isElectionManagerAuth,
  Prose,
  TallyReport,
  TallyReportMetadata,
  Text,
  Button,
} from '@votingworks/ui';
import {
  generateDefaultReportFilename,
  generateFileContentToSaveAsPdf,
} from '../utils/save_as_pdf';

import {
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
  PartyReportScreenProps,
  BatchReportScreenProps,
  VotingMethodReportScreenProps,
} from '../config/types';
import { AppContext } from '../contexts/app_context';

import { PrintButton } from '../components/print_button';
import { NavigationScreen } from '../components/navigation_screen';
import { LinkButton } from '../components/link_button';

import { routerPaths } from '../router_paths';
import { filterTalliesByParamsAndBatchId } from '../lib/votecounting';

import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';
import { ElectionManagerWriteInTallyReport } from '../components/election_manager_writein_tally_report';
import { PrintableArea } from '../components/printable_area';

const TallyReportPreview = styled(TallyReport)`
  section {
    margin: 1rem 0 2rem;
    background: #ffffff;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

const initialWriteInCounts = new Map<ContestId, Map<string, number>>([
  [
    'Governor-061a401b',
    new Map([
      ['Betty Mary', 12],
      ['Charles Foo', 4],
      ['Doug Dough', 7],
      ['Fanny May', 17],
      ['Guy Fair', 17],
      ['Harold Humperdink', 17],
    ]),
  ],
  [
    'United-States-Senator-d3f1c75b',
    new Map([
      ['Bob Mayfield', 4],
      ['Chuck Rathburger', 4],
      ['Doug Dough', 7],
    ]),
  ],
  [
    'Representative-in-Congress-24683b44',
    new Map([
      ['Fred Wilson', 4],
      ['Doug Dough', 7],
      ['Fanny May', 17],
    ]),
  ],
  [
    'Executive-Councilor-bb22557f',
    new Map([
      ['Fred Wilson', 4],
      ['Charles Foo', 4],
      ['Fanny May', 17],
    ]),
  ],
  [
    'State-Representatives-Hillsborough-District-34-b1012d38',
    new Map([['Fanny May', 31]]),
  ],
]);

console.log({
  'Governor-061a401b': initialWriteInCounts.get('Governor-061a401b'),
});

export function TallyWriteInReportScreen(): JSX.Element {
  const printReportRef = useRef<HTMLDivElement>(null);
  const previewReportRef = useRef<HTMLDivElement>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [writeInCounts, setWriteInCounts] =
    useState<Map<ContestId, Map<string, number>>>(initialWriteInCounts);

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
    isTabulationRunning,
    auth,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth)); // TODO(auth) check permissions for viewing tally reports.
  const userRole = auth.user.role;

  const { election } = electionDefinition;
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  useEffect(() => {
    if (previewReportRef?.current && printReportRef?.current) {
      previewReportRef.current.innerHTML = printReportRef.current.innerHTML;
    }
  }, [previewReportRef, printReportRef, writeInCounts]);

  // Get write-in tallies
  useEffect(() => {
    async function fetchAdjudicationCounts() {
      const res = await fetch('/admin/write-ins/adjudications/counts');
      const map = new Map<ContestId, Map<string, number>>();
      for (const {
        contestId,
        transcribedValue,
        adjudicationCount,
      } of await res.json()) {
        const innerMap = map.get(contestId) || new Map<string, number>();
        innerMap.set(transcribedValue, adjudicationCount);
        map.set(contestId, innerMap);
      }
      setWriteInCounts(map);
    }
    void fetchAdjudicationCounts();
  }, [setWriteInCounts]);

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

  function afterPrint() {
    void logger.log(LogEventId.TallyReportPrinted, userRole, {
      message: `User printed ${reportDisplayTitle}`,
      disposition: 'success',
      tallyReportTitle: reportDisplayTitle,
    });
  }

  function afterPrintError(errorMessage: string) {
    void logger.log(LogEventId.TallyReportPrinted, userRole, {
      message: `Error in attempting to print ${reportDisplayTitle}: ${errorMessage}`,
      disposition: 'failure',
      tallyReportTitle: reportDisplayTitle,
      errorMessage,
      result: 'User shown error.',
    });
  }

  const defaultReportFilename = generateDefaultReportFilename(
    'tabulation-writein-report',
    election,
    fileSuffix
  );

  const generatedAtTime = new Date();

  console.log({
    isTabulationRunning,
    writeInCounts,
    batchId,
    batchLabel,
    generatedAtTime,
    partyId,
    precinctId,
    scannerId,
    votingMethod,
  });

  // if (isTabulationRunning || !writeInCounts) {
  //   return (
  //     <NavigationScreen centerChild>
  //       <Prose textCenter>
  //         <h1>Building Tabulation Report...</h1>
  //         <p>This may take a few seconds.</p>
  //       </Prose>
  //     </NavigationScreen>
  //   );
  // }

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
            <PrintButton
              afterPrint={afterPrint}
              afterPrintError={afterPrintError}
              primary
              sides="one-sided"
            >
              Print Report
            </PrintButton>{' '}
            {window.kiosk && (
              <Button onPress={() => setIsSaveModalOpen(true)}>
                Save Report as PDF
              </Button>
            )}
          </p>
          <p>
            <LinkButton small to={routerPaths.tally}>
              Back to Tally Index
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
        <TallyReportPreview ref={previewReportRef} />
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={generateFileContentToSaveAsPdf}
          defaultFilename={defaultReportFilename}
          fileType={FileType.TallyReport}
        />
      )}
      <PrintableArea data-testid="printable-area">
        <ElectionManagerWriteInTallyReport
          batchId={batchId}
          batchLabel={batchLabel}
          election={election}
          writeInCounts={writeInCounts}
          generatedAtTime={generatedAtTime}
          isOfficialResults={isOfficialResults}
          partyId={partyId}
          precinctId={precinctId}
          ref={printReportRef}
          scannerId={scannerId}
          votingMethod={votingMethod}
        />
      </PrintableArea>
    </React.Fragment>
  );
}
