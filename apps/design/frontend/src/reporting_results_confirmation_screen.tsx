import { useEffect } from 'react';
import {
  LoadingAnimation,
  Main,
  MainContent,
  MainHeader,
  Screen,
  TallyReportColumns,
  ContestResultsTable,
  ReportElectionInfo,
  ReportMetadata,
  LabeledValue,
  Callout,
  TestModeBanner,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  formatBallotHash,
  Election,
  PrecinctSelection,
  Tabulation,
  ContestId,
} from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getContestsForPrecinctAndElection,
  getPollsReportTitle,
  getPrecinctSelectionName,
  groupContestsByParty,
} from '@votingworks/utils';
import styled from 'styled-components';
import { processQrCodeReport } from './public_api';

const ColumnSpan = styled.span`
  display: flex;
  flex-direction: column;
`;

export function ResultsScreen({
  screenTitle,
  children,
}: {
  screenTitle: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <Main flexColumn>
        <MainHeader>
          <h1>{screenTitle}</h1>
        </MainHeader>
        {children}
      </Main>
    </Screen>
  );
}

interface ReportDetailsProps {
  ballotHash: string;
  machineId: string;
  signedTimestamp: Date;
  election: Election;
  precinctSelection: PrecinctSelection;
}

function ReportDetails({
  ballotHash,
  machineId,
  signedTimestamp,
  election,
  precinctSelection,
}: ReportDetailsProps): JSX.Element {
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    precinctSelection
  );

  return (
    <div>
      <ReportElectionInfo election={election} />
      <ReportMetadata>
        <ColumnSpan>
          <LabeledValue label="Precinct" value={precinctName} />
          <LabeledValue
            label="Report Created At"
            value={formatFullDateTimeZone(
              DateTime.fromJSDate(signedTimestamp),
              { includeWeekday: false, includeSeconds: true }
            )}
          />
          <LabeledValue label="Scanner ID" value={machineId} />
          <LabeledValue
            label="Election ID"
            value={formatBallotHash(ballotHash)}
          />
        </ColumnSpan>
      </ReportMetadata>
    </div>
  );
}

function ReportHeader({
  isLive,
  reportTitle,
}: {
  isLive: boolean;
  reportTitle: string;
}): JSX.Element {
  const lowerCasedReportTitle = reportTitle
    .split(' ')
    .map((word) => word.toLowerCase())
    .join(' ');
  return (
    <div style={{ flexDirection: 'column', gap: '1rem', display: 'flex' }}>
      <Callout icon="Done" color="primary">
        The {lowerCasedReportTitle} has been sent to VxDesign.
      </Callout>
      {!isLive && (
        <div>
          <TestModeBanner />
        </div>
      )}
    </div>
  );
}

function PollsOpenReportConfirmation({
  ballotHash,
  machineId,
  isLive,
  signedTimestamp,
  election,
  precinctSelection,
}: ReportDetailsProps & { isLive: boolean }): JSX.Element {
  const reportTitle = getPollsReportTitle('open_polls');
  return (
    <ResultsScreen screenTitle={`${reportTitle} Sent`}>
      <MainContent>
        <ReportHeader reportTitle={reportTitle} isLive={isLive} />
        <ReportDetails
          ballotHash={ballotHash}
          machineId={machineId}
          signedTimestamp={signedTimestamp}
          election={election}
          precinctSelection={precinctSelection}
        />
      </MainContent>
    </ResultsScreen>
  );
}

function PollsClosedReportConfirmation({
  ballotHash,
  machineId,
  isLive,
  signedTimestamp,
  election,
  precinctSelection,
  contestResults,
}: ReportDetailsProps & {
  contestResults: Record<ContestId, Tabulation.ContestResults>;
  isLive: boolean;
}): JSX.Element {
  const contestsForPrecinct = getContestsForPrecinctAndElection(
    election,
    precinctSelection
  );
  const contestsByParty = groupContestsByParty(election, contestsForPrecinct);
  const reportTitle = getPollsReportTitle('close_polls');
  const partyNamesById = election.parties.reduce<Record<string, string>>(
    (acc, party) => ({ ...acc, [party.id]: party.fullName }),
    {}
  );

  return (
    <ResultsScreen screenTitle={`${reportTitle} Sent`}>
      <MainContent>
        <ReportHeader reportTitle={reportTitle} isLive={isLive} />
        <ReportDetails
          ballotHash={ballotHash}
          machineId={machineId}
          signedTimestamp={signedTimestamp}
          election={election}
          precinctSelection={precinctSelection}
        />
        {contestsByParty.map(({ partyId, contests }) => (
          <div key={partyId || 'non-partisan'}>
            {partyId && <h2>{partyNamesById[partyId]} Contests</h2>}
            {!partyId && contestsByParty.length > 1 && (
              <h2>Non-Partisan Contests</h2>
            )}
            <TallyReportColumns>
              {contests.map((contest) => {
                const currentContestResults = contestResults[contest.id];
                assert(
                  currentContestResults,
                  `missing scanned results for contest ${contest.id}`
                );
                return (
                  <ContestResultsTable
                    key={contest.id}
                    election={election}
                    contest={contest}
                    scannedContestResults={currentContestResults}
                  />
                );
              })}
            </TallyReportColumns>
          </div>
        ))}
      </MainContent>
    </ResultsScreen>
  );
}

export function ReportingResultsConfirmationScreen(): JSX.Element | null {
  const queryParams = new URLSearchParams(window.location.search);
  const payload = queryParams.get('p');
  const signature = queryParams.get('s');
  const certificate = queryParams.get('c');

  const {
    mutate: processQrCodeReportMutate,
    data: reportResult,
    isLoading,
    error,
  } = processQrCodeReport.useMutation();

  useEffect(() => {
    if (payload && signature && certificate) {
      processQrCodeReportMutate({ payload, signature, certificate });
    }
  }, [payload, signature, certificate, processQrCodeReportMutate]);

  if (
    !payload ||
    !signature ||
    !certificate ||
    error ||
    (reportResult && reportResult.isErr())
  ) {
    if (reportResult && reportResult.err() === 'invalid-signature') {
      return (
        <ResultsScreen screenTitle="Error Sending Report">
          <MainContent>
            <Callout color="danger" icon="Warning">
              Signature not verified. Please try scanning the QR code again.
            </Callout>
          </MainContent>
        </ResultsScreen>
      );
    }

    if (reportResult && reportResult.err() === 'no-election-found') {
      return (
        <ResultsScreen screenTitle="Error Sending Report">
          <MainContent>
            <Callout color="danger" icon="Warning">
              Wrong election. Confirm VxScan and VxDesign are configured with
              the same election package.
            </Callout>
          </MainContent>
        </ResultsScreen>
      );
    }
    return (
      <ResultsScreen screenTitle="Error Sending Report">
        <MainContent>
          <Callout color="danger" icon="Warning">
            Invalid request. Please try scanning the QR code again.
          </Callout>
        </MainContent>
      </ResultsScreen>
    );
  }

  if (isLoading || !reportResult) {
    return (
      <ResultsScreen screenTitle="Sending Report">
        <Main centerChild>
          <LoadingAnimation />
        </Main>
      </ResultsScreen>
    );
  }

  const reportData = reportResult.ok();

  // Check the kind of report and render the appropriate component
  switch (reportData.pollsState) {
    case 'polls_open':
      return (
        <PollsOpenReportConfirmation
          ballotHash={reportData.ballotHash}
          machineId={reportData.machineId}
          isLive={reportData.isLive}
          signedTimestamp={reportData.signedTimestamp}
          election={reportData.election}
          precinctSelection={reportData.precinctSelection}
        />
      );
    case 'polls_closed_final':
      return (
        <PollsClosedReportConfirmation
          ballotHash={reportData.ballotHash}
          machineId={reportData.machineId}
          isLive={reportData.isLive}
          signedTimestamp={reportData.signedTimestamp}
          election={reportData.election}
          precinctSelection={reportData.precinctSelection}
          contestResults={reportData.contestResults}
        />
      );
    default:
      /* istanbul ignore next -  @preserve */
      throwIllegalValue(reportData, 'pollsState');
  }
}
