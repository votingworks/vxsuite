import { strict as assert } from 'assert';
import React, { useContext, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import { useParams } from 'react-router-dom';
import { find, filterTalliesByParams } from '@votingworks/utils';
import {
  ExternalTally,
  VotingMethod,
  getLabelForVotingMethod,
  Tally,
  unsafeParse,
  PartyIdSchema,
} from '@votingworks/types';
import {
  ContestTally,
  TallyReport,
  TallyReportColumns,
  ReportSection,
  TallyReportMetadata,
  TallyReportSummary,
  LogoMark,
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
import { Button } from '../components/button';
import { NavigationScreen } from '../components/navigation_screen';
import { Prose } from '../components/prose';
import { LinkButton } from '../components/link_button';

import { routerPaths } from '../router_paths';
import { filterTalliesByParamsAndBatchId } from '../lib/votecounting';
import { filterExternalTalliesByParams } from '../utils/external_tallies';

import { Text } from '../components/text';
import { SaveFileToUsb, FileType } from '../components/save_file_to_usb';

const TallyReportPreview = styled(TallyReport)`
  section {
    margin: 1rem 0 2rem;
    background: #ffffff;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }
`;

export function TallyReportScreen(): JSX.Element {
  const printReportRef = useRef<HTMLDivElement>(null);
  const previewReportRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const {
    precinctId: precinctIdFromProps,
  } = useParams<PrecinctReportScreenProps>();
  const { scannerId } = useParams<ScannerReportScreenProps>();
  const { batchId } = useParams<BatchReportScreenProps>();
  const { partyId: partyIdFromProps } = useParams<PartyReportScreenProps>();
  const {
    votingMethod: votingMethodFromProps,
  } = useParams<VotingMethodReportScreenProps>();
  const votingMethod = votingMethodFromProps as VotingMethod;
  const {
    electionDefinition,
    isOfficialResults,
    fullElectionTally,
    fullElectionExternalTallies,
    isTabulationRunning,
  } = useContext(AppContext);
  assert(electionDefinition);

  if (isTabulationRunning) {
    return (
      <NavigationScreen mainChildCenter>
        <Prose textCenter>
          <h1>Building Tabulation Report...</h1>
          <p>This may take a few seconds.</p>
        </Prose>
      </NavigationScreen>
    );
  }

  const { election } = electionDefinition;
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial';

  const ballotStylePartyIds =
    partyIdFromProps !== undefined
      ? [unsafeParse(PartyIdSchema, partyIdFromProps)]
      : Array.from(new Set(election.ballotStyles.map((bs) => bs.partyId)));

  const precinctIds =
    precinctIdFromProps === 'all'
      ? election.precincts.map((p) => p.id)
      : [precinctIdFromProps];

  const precinctName =
    (precinctIdFromProps &&
      precinctIdFromProps !== 'all' &&
      find(election.precincts, (p) => p.id === precinctIdFromProps).name) ||
    undefined;

  let fileSuffix = precinctName;
  let batchLabel = '';
  function reportDisplayTitle() {
    if (precinctName) {
      return `${statusPrefix} Precinct Tally Report for ${precinctName}`;
    }
    if (scannerId) {
      fileSuffix = `scanner-${scannerId}`;
      return `${statusPrefix} Scanner Tally Report for Scanner ${scannerId}`;
    }
    if (batchId) {
      assert(fullElectionTally);
      const batchTally = filterTalliesByParamsAndBatchId(
        fullElectionTally,
        election,
        batchId,
        {}
      );
      fileSuffix = `batch-${batchId}`;
      batchLabel = `${
        batchTally.batchLabel
      } (Scanner: ${batchTally.scannerIds.join(', ')})`;
      return `${statusPrefix} Batch Tally Report for ${batchLabel}`;
    }
    if (precinctIdFromProps === 'all') {
      fileSuffix = 'all-precincts';
      return `${statusPrefix} ${election.title} Tally Reports for All Precincts`;
    }
    if (partyIdFromProps) {
      const party = find(election.parties, (p) => p.id === partyIdFromProps);
      fileSuffix = party.fullName;
      return `${statusPrefix} Tally Report for ${party.fullName}`;
    }
    if (votingMethod) {
      const label = getLabelForVotingMethod(votingMethod);
      fileSuffix = `${label}-ballots`;
      return `${statusPrefix} ${label} Ballot Tally Report`;
    }
    return `${statusPrefix} ${election.title} Tally Report`;
  }

  const defaultReportFilename = generateDefaultReportFilename(
    'tabulation-report',
    election,
    fileSuffix
  );

  function toggleReportPreview() {
    setShowPreview((s) => !s);
  }

  const generatedAtTime = new Date();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (previewReportRef?.current && printReportRef?.current) {
      previewReportRef.current.innerHTML = printReportRef.current.innerHTML;
    }
  }, [previewReportRef, printReportRef, showPreview]);

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose>
          <h1>{reportDisplayTitle()}</h1>
          <TallyReportMetadata
            generatedAtTime={generatedAtTime}
            election={election}
          />
          <p>
            <PrintButton primary sides="one-sided">
              Print Report
            </PrintButton>{' '}
            <Button onPress={toggleReportPreview}>
              {showPreview ? 'Hide Preview' : 'Preview Report'}
            </Button>{' '}
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
          {showPreview && (
            <React.Fragment>
              <h2>Report Preview</h2>
              <Text italic small>
                <strong>Note:</strong> Printed reports may be paginated to more
                than one piece of paper.
              </Text>
            </React.Fragment>
          )}
        </Prose>
        {showPreview && <TallyReportPreview ref={previewReportRef} />}
      </NavigationScreen>
      {isSaveModalOpen && (
        <SaveFileToUsb
          onClose={() => setIsSaveModalOpen(false)}
          generateFileContent={generateFileContentToSaveAsPdf}
          defaultFilename={defaultReportFilename}
          fileType={FileType.TallyReport}
        />
      )}
      <TallyReport ref={printReportRef} className="print-only">
        {ballotStylePartyIds.map((partyId) =>
          precinctIds.map((precinctId) => {
            const party = election.parties.find((p) => p.id === partyId);
            const electionTitle = party
              ? `${party.fullName} ${election.title}`
              : election.title;

            const tallyForReport = filterTalliesByParams(
              fullElectionTally,
              election,
              { precinctId, scannerId, partyId, votingMethod, batchId }
            );
            const ballotCountsByVotingMethod: Tally['ballotCountsByVotingMethod'] = {
              ...tallyForReport.ballotCountsByVotingMethod,
            };
            let reportBallotCount = tallyForReport.numberOfBallotsCounted;
            const externalTalliesForReport: ExternalTally[] = [];
            for (const t of fullElectionExternalTallies) {
              const filteredTally = filterExternalTalliesByParams(t, election, {
                precinctId,
                partyId,
                scannerId,
                batchId,
                votingMethod,
              });
              if (filteredTally !== undefined) {
                externalTalliesForReport.push(filteredTally);
                ballotCountsByVotingMethod[t.votingMethod] =
                  filteredTally.numberOfBallotsCounted +
                  (ballotCountsByVotingMethod[t.votingMethod] ?? 0);
                reportBallotCount += filteredTally.numberOfBallotsCounted;
              }
            }

            if (precinctId) {
              const currentPrecinctName = find(
                election.precincts,
                (p) => p.id === precinctId
              ).name;
              return (
                <ReportSection key={`${partyId}-${precinctId}`}>
                  <LogoMark />
                  <Prose maxWidth={false}>
                    <h1>
                      {statusPrefix} Precinct Tally Report for:{' '}
                      {currentPrecinctName}
                    </h1>
                    <h2>{electionTitle}</h2>
                    <TallyReportMetadata
                      generatedAtTime={generatedAtTime}
                      election={election}
                    />
                  </Prose>
                  <TallyReportColumns>
                    <TallyReportSummary
                      totalBallotCount={reportBallotCount}
                      ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                    />
                    <ContestTally
                      election={election}
                      electionTally={tallyForReport}
                      externalTallies={externalTalliesForReport}
                      precinctId={precinctId}
                    />
                  </TallyReportColumns>
                </ReportSection>
              );
            }

            if (scannerId) {
              return (
                <ReportSection key={`${partyId}-${scannerId}`}>
                  <LogoMark />
                  <Prose maxWidth={false}>
                    <h1>
                      {statusPrefix} Scanner Tally Report for Scanner:{' '}
                      {scannerId}
                    </h1>
                    <h2>{electionTitle}</h2>
                    <TallyReportMetadata
                      generatedAtTime={generatedAtTime}
                      election={election}
                    />
                  </Prose>
                  <TallyReportColumns>
                    <TallyReportSummary
                      totalBallotCount={reportBallotCount}
                      ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                    />
                    <ContestTally
                      election={election}
                      electionTally={tallyForReport}
                      externalTallies={[]}
                    />
                  </TallyReportColumns>
                </ReportSection>
              );
            }

            if (batchId) {
              return (
                <ReportSection key={`${partyId}-${batchId}`}>
                  <LogoMark />
                  <Prose maxWidth={false}>
                    <h1>
                      {statusPrefix} Batch Tally Report for {batchLabel}:
                    </h1>
                    <h2>{electionTitle}</h2>
                    <TallyReportMetadata
                      generatedAtTime={generatedAtTime}
                      election={election}
                    />
                  </Prose>
                  <TallyReportColumns>
                    <TallyReportSummary
                      totalBallotCount={reportBallotCount}
                      ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                    />
                    <ContestTally
                      election={election}
                      electionTally={tallyForReport}
                      externalTallies={[]}
                    />
                  </TallyReportColumns>
                </ReportSection>
              );
            }

            if (votingMethod) {
              const label = getLabelForVotingMethod(votingMethod);
              return (
                <ReportSection key={`${partyId}-${votingMethod}`}>
                  <LogoMark />
                  <Prose maxWidth={false}>
                    <h1>
                      {statusPrefix} “{label}” Ballot Tally Report
                    </h1>
                    <h2>{electionTitle}</h2>
                    <TallyReportMetadata
                      generatedAtTime={generatedAtTime}
                      election={election}
                    />
                  </Prose>
                  <TallyReportColumns>
                    <ContestTally
                      election={election}
                      electionTally={tallyForReport}
                      externalTallies={externalTalliesForReport}
                    />
                  </TallyReportColumns>
                </ReportSection>
              );
            }

            return (
              <ReportSection
                key={partyId || 'none'}
                data-testid="election-full-tally-report"
              >
                <LogoMark />
                <Prose maxWidth={false}>
                  <h1>
                    {statusPrefix} {electionTitle} Tally Report
                  </h1>
                  <TallyReportMetadata
                    generatedAtTime={generatedAtTime}
                    election={election}
                  />
                </Prose>
                <TallyReportColumns>
                  <TallyReportSummary
                    totalBallotCount={reportBallotCount}
                    ballotCountsByVotingMethod={ballotCountsByVotingMethod}
                  />
                  <ContestTally
                    election={election}
                    electionTally={tallyForReport}
                    externalTallies={externalTalliesForReport}
                  />
                </TallyReportColumns>
              </ReportSection>
            );
          })
        )}
      </TallyReport>
    </React.Fragment>
  );
}
