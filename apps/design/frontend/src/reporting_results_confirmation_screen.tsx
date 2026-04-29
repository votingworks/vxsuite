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
  TestModeReportBanner,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  formatBallotHash,
  Election,
  LiveReportVotingType,
  PollsTransitionType,
  Tabulation,
  ContestId,
} from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getContestsForPrecinctAndElection,
  getEmptyElectionResults,
  getPollsReportTitle,
  groupContestsByParty,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { pollingPlacePrecinctIds } from '@votingworks/types';
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

function getVotingTypeLabel(votingType: LiveReportVotingType): string {
  switch (votingType) {
    case 'election_day':
      return 'Election Day';
    case 'early_voting':
      return 'Early Voting';
    case 'absentee':
      return 'Absentee';
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(votingType);
  }
}

function getCloseReportTitle(votingType: LiveReportVotingType): string {
  return votingType === 'absentee' ? 'Tally Report' : 'Polls Closed Report';
}

function getTimestampLabel(pollsTransition: PollsTransitionType): string {
  switch (pollsTransition) {
    case 'open_polls':
      return 'Polls Opened at';
    case 'resume_voting':
      return 'Voting Resumed at';
    case 'pause_voting':
      return 'Voting Paused at';
    case 'close_polls':
      return 'Polls Closed at';
    /* istanbul ignore next - @preserve */
    default:
      throwIllegalValue(pollsTransition);
  }
}

interface ReportDetailsProps {
  ballotHash: string;
  machineId: string;
  pollsTransitionTime: Date;
  election: Election;
  pollingPlaceId?: string;
  votingType: LiveReportVotingType;
  pollsTransitionType: PollsTransitionType;
}

function ReportDetails({
  ballotHash,
  machineId,
  pollsTransitionTime,
  election,
  pollingPlaceId,
  votingType,
  pollsTransitionType,
}: ReportDetailsProps): JSX.Element {
  const pollingPlace = election.pollingPlaces?.find(
    (p) => p.id === pollingPlaceId
  );

  const timestamp = pollsTransitionTime;
  const timestampLabel = getTimestampLabel(pollsTransitionType);

  return (
    <div>
      <ReportElectionInfo election={election} />
      <ReportMetadata>
        <ColumnSpan>
          {pollingPlace && (
            <LabeledValue label="Polling Place" value={pollingPlace.name} />
          )}
          {timestamp && (
            <LabeledValue
              label={timestampLabel}
              value={formatFullDateTimeZone(DateTime.fromJSDate(timestamp), {
                includeWeekday: false,
                includeSeconds: true,
              })}
            />
          )}
          <LabeledValue label="Machine ID" value={machineId} />
          <LabeledValue
            label="Election ID"
            value={formatBallotHash(ballotHash)}
          />
          <LabeledValue
            label="Voting Type"
            value={getVotingTypeLabel(votingType)}
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
          <TestModeReportBanner />
        </div>
      )}
    </div>
  );
}

function PartialReportHeader({
  isLive,
  reportTitle,
  numPages,
  pageIndex,
}: {
  isLive: boolean;
  reportTitle: string;
  numPages: number;
  pageIndex: number;
}): JSX.Element {
  const lowerCasedReportTitle = reportTitle
    .split(' ')
    .map((word) => word.toLowerCase())
    .join(' ');
  return (
    <div style={{ flexDirection: 'column', gap: '1rem', display: 'flex' }}>
      <Callout icon="CircleDot" color="primary">
        Part {pageIndex + 1}/{numPages} of the {lowerCasedReportTitle} has been
        received. Send the next part to continue.
      </Callout>
      {!isLive && (
        <div>
          <TestModeReportBanner />
        </div>
      )}
    </div>
  );
}

function PollsOpenReportConfirmation({
  ballotHash,
  machineId,
  isLive,

  pollsTransitionTime,
  election,
  pollingPlaceId,
  votingType,
  pollsTransitionType,
  ballotCount,
}: ReportDetailsProps & {
  isLive: boolean;
  ballotCount?: number;
}): JSX.Element {
  const reportTitle = getPollsReportTitle('open_polls');
  return (
    <ResultsScreen screenTitle={`${reportTitle} Sent`}>
      <MainContent>
        <ReportHeader reportTitle={reportTitle} isLive={isLive} />
        <ReportDetails
          machineId={machineId}
          ballotHash={ballotHash}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          pollingPlaceId={pollingPlaceId}
          votingType={votingType}
          pollsTransitionType={pollsTransitionType}
        />
        {ballotCount !== undefined && (
          <LabeledValue
            label="Ballots Scanned"
            value={ballotCount.toLocaleString()}
          />
        )}
      </MainContent>
    </ResultsScreen>
  );
}

function PollsPausedReportConfirmation({
  ballotHash,
  machineId,
  isLive,

  pollsTransitionTime,
  election,
  pollingPlaceId,
  votingType,
  pollsTransitionType,
  ballotCount,
}: ReportDetailsProps & {
  isLive: boolean;
  ballotCount?: number;
}): JSX.Element {
  const reportTitle = getPollsReportTitle('pause_voting');
  return (
    <ResultsScreen screenTitle={`${reportTitle} Sent`}>
      <MainContent>
        <ReportHeader reportTitle={reportTitle} isLive={isLive} />
        <ReportDetails
          machineId={machineId}
          ballotHash={ballotHash}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          pollingPlaceId={pollingPlaceId}
          votingType={votingType}
          pollsTransitionType={pollsTransitionType}
        />
        {ballotCount !== undefined && (
          <LabeledValue
            label="Ballots Scanned"
            value={ballotCount.toLocaleString()}
          />
        )}
      </MainContent>
    </ResultsScreen>
  );
}

function VotingResumedReportConfirmation({
  ballotHash,
  machineId,
  isLive,

  pollsTransitionTime,
  election,
  pollingPlaceId,
  votingType,
  pollsTransitionType,
  ballotCount,
}: ReportDetailsProps & {
  isLive: boolean;
  ballotCount?: number;
}): JSX.Element {
  const reportTitle = getPollsReportTitle('resume_voting');
  return (
    <ResultsScreen screenTitle={`${reportTitle} Sent`}>
      <MainContent>
        <ReportHeader reportTitle={reportTitle} isLive={isLive} />
        <ReportDetails
          machineId={machineId}
          ballotHash={ballotHash}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          pollingPlaceId={pollingPlaceId}
          votingType={votingType}
          pollsTransitionType={pollsTransitionType}
        />
        {ballotCount !== undefined && (
          <LabeledValue
            label="Ballots Scanned"
            value={ballotCount.toLocaleString()}
          />
        )}
      </MainContent>
    </ResultsScreen>
  );
}

function PollsClosedPartialReportConfirmation({
  ballotHash,
  machineId,
  isLive,

  pollsTransitionTime,
  election,
  pollingPlaceId,
  votingType,
  pollsTransitionType,
  numPages,
  pageIndex,
}: ReportDetailsProps & {
  isLive: boolean;
  numPages: number;
  pageIndex: number;
}): JSX.Element {
  const reportTitle = getCloseReportTitle(votingType);
  return (
    <ResultsScreen
      screenTitle={`${reportTitle} Part ${pageIndex + 1}/${numPages} Sent`}
    >
      <MainContent>
        <PartialReportHeader
          reportTitle={reportTitle}
          isLive={isLive}
          numPages={numPages}
          pageIndex={pageIndex}
        />
        <ReportDetails
          machineId={machineId}
          ballotHash={ballotHash}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          pollingPlaceId={pollingPlaceId}
          votingType={votingType}
          pollsTransitionType={pollsTransitionType}
        />
      </MainContent>
    </ResultsScreen>
  );
}

function PrecinctTallySection({
  election,
  precinctId,
  precinctName,
  contestResults,
}: {
  election: Election;
  precinctId: string;
  precinctName: string;
  contestResults?: Record<ContestId, Tabulation.ContestResults>;
}): JSX.Element {
  const precinctSelection = singlePrecinctSelectionFor(precinctId);
  const contests = getContestsForPrecinctAndElection(
    election,
    precinctSelection
  );
  const contestsByParty = groupContestsByParty(election, contests);
  const partyNamesById = election.parties.reduce<Record<string, string>>(
    (acc, party) => ({ ...acc, [party.id]: party.fullName }),
    {}
  );

  // Use empty (zero) results for precincts with no transmitted data
  const emptyResults = getEmptyElectionResults(election).contestResults;
  const effectiveResults = contestResults ?? emptyResults;

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>{precinctName}</h2>
      {contestsByParty.map(({ partyId, contests: partyContests }) => (
        <div key={partyId || 'nonpartisan'}>
          {partyId && <h3>{partyNamesById[partyId]} Contests</h3>}
          {!partyId && contestsByParty.length > 1 && (
            <h3>Nonpartisan Contests</h3>
          )}
          <TallyReportColumns>
            {partyContests.map((contest) => {
              const currentContestResults = effectiveResults[contest.id];
              if (!currentContestResults) return null;
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
    </div>
  );
}

function PollsClosedReportConfirmation({
  ballotHash,
  machineId,
  isLive,

  pollsTransitionTime,
  election,
  pollingPlaceId,
  votingType,
  pollsTransitionType,
  contestResultsByPrecinct,
}: ReportDetailsProps & {
  contestResultsByPrecinct: Record<
    string,
    Record<ContestId, Tabulation.ContestResults>
  >;
  isLive: boolean;
}): JSX.Element {
  const reportTitle = getCloseReportTitle(votingType);

  const pollingPlace = assertDefined(
    election.pollingPlaces?.find((p) => p.id === pollingPlaceId)
  );
  const pollingPlacePrecincts = [...pollingPlacePrecinctIds(pollingPlace)];

  return (
    <ResultsScreen screenTitle={`${reportTitle} Sent`}>
      <MainContent>
        <ReportHeader reportTitle={reportTitle} isLive={isLive} />
        <ReportDetails
          machineId={machineId}
          ballotHash={ballotHash}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          pollingPlaceId={pollingPlaceId}
          votingType={votingType}
          pollsTransitionType={pollsTransitionType}
        />
        {pollingPlacePrecincts.map((precinctId) => {
          const precinct = assertDefined(
            election.precincts.find((p) => p.id === precinctId)
          );
          return (
            <PrecinctTallySection
              key={precinctId}
              election={election}
              precinctId={precinctId}
              precinctName={precinct.name}
              contestResults={contestResultsByPrecinct[precinctId]}
            />
          );
        })}
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
            <Callout color="danger" icon="Danger">
              Signature not verified. Please try scanning the QR code again.
            </Callout>
          </MainContent>
        </ResultsScreen>
      );
    }

    if (reportResult && reportResult.err() === 'no-election-export-found') {
      return (
        <ResultsScreen screenTitle="Error Sending Report">
          <MainContent>
            <Callout color="danger" icon="Danger">
              Wrong election. Confirm VxScan and VxDesign are configured with
              the same election package.
            </Callout>
          </MainContent>
        </ResultsScreen>
      );
    }

    if (reportResult && reportResult.err() === 'election-out-of-date') {
      return (
        <ResultsScreen screenTitle="Error Sending Report">
          <MainContent>
            <Callout color="danger" icon="Danger">
              This election is no longer compatible with Live Reports. Please
              export a new election package to continue using Live Reports.
            </Callout>
          </MainContent>
        </ResultsScreen>
      );
    }

    return (
      <ResultsScreen screenTitle="Error Sending Report">
        <MainContent>
          <Callout color="danger" icon="Danger">
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
  switch (reportData.pollsTransitionType) {
    case 'open_polls':
      return (
        <PollsOpenReportConfirmation
          ballotHash={reportData.ballotHash}
          machineId={reportData.machineId}
          isLive={reportData.isLive}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          pollingPlaceId={reportData.pollingPlaceId}
          ballotCount={reportData.ballotCount}
          votingType={reportData.votingType}
          pollsTransitionType={reportData.pollsTransitionType}
        />
      );
    case 'resume_voting':
      return (
        <VotingResumedReportConfirmation
          ballotHash={reportData.ballotHash}
          machineId={reportData.machineId}
          isLive={reportData.isLive}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          pollingPlaceId={reportData.pollingPlaceId}
          ballotCount={reportData.ballotCount}
          votingType={reportData.votingType}
          pollsTransitionType={reportData.pollsTransitionType}
        />
      );
    case 'pause_voting':
      return (
        <PollsPausedReportConfirmation
          ballotHash={reportData.ballotHash}
          machineId={reportData.machineId}
          isLive={reportData.isLive}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          pollingPlaceId={reportData.pollingPlaceId}
          ballotCount={reportData.ballotCount}
          votingType={reportData.votingType}
          pollsTransitionType={reportData.pollsTransitionType}
        />
      );
    case 'close_polls':
      if (!reportData.isPartial) {
        return (
          <PollsClosedReportConfirmation
            ballotHash={reportData.ballotHash}
            machineId={reportData.machineId}
            isLive={reportData.isLive}
            pollsTransitionTime={reportData.pollsTransitionTime}
            election={reportData.election}
            pollingPlaceId={reportData.pollingPlaceId}
            contestResultsByPrecinct={reportData.contestResultsByPrecinct}
            votingType={reportData.votingType}
            pollsTransitionType={reportData.pollsTransitionType}
          />
        );
      }
      return (
        <PollsClosedPartialReportConfirmation
          ballotHash={reportData.ballotHash}
          machineId={reportData.machineId}
          isLive={reportData.isLive}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          pollingPlaceId={reportData.pollingPlaceId}
          numPages={reportData.numPages}
          pageIndex={reportData.pageIndex}
          votingType={reportData.votingType}
          pollsTransitionType={reportData.pollsTransitionType}
        />
      );

    default:
      /* istanbul ignore next -  @preserve */
      throwIllegalValue(reportData, 'pollsTransitionType');
  }
}
