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
  LiveReportVotingType,
  PollsTransitionType,
  PrecinctId,
  Tabulation,
  ContestId,
} from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getContestsForPrecinctAndElection,
  getPollsReportTitle,
  groupContestsByParty,
  singlePrecinctSelectionFor,
  ALL_PRECINCTS_SELECTION,
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
  reportCreatedAt?: Date;
  pollsTransitionTime?: Date;
  election: Election;
  precinctIds: PrecinctId[];
  votingType: LiveReportVotingType;
  pollsTransitionType: PollsTransitionType;
}

function getPrecinctNameFromIds(
  election: Election,
  precinctIds: PrecinctId[]
): string {
  if (precinctIds.length === 0) {
    return 'All Precincts';
  }
  if (precinctIds.length === 1) {
    const precinct = election.precincts.find((p) => p.id === precinctIds[0]);
    return precinct?.name ?? precinctIds[0];
  }
  return precinctIds
    .map((id) => {
      const precinct = election.precincts.find((p) => p.id === id);
      return precinct?.name ?? id;
    })
    .join(', ');
}

function ReportDetails({
  ballotHash,
  machineId,
  reportCreatedAt,
  pollsTransitionTime,
  election,
  precinctIds,
  votingType,
  pollsTransitionType,
}: ReportDetailsProps): JSX.Element {
  const precinctName = getPrecinctNameFromIds(election, precinctIds);

  const timestamp = pollsTransitionTime ?? reportCreatedAt;
  const timestampLabel = pollsTransitionTime
    ? getTimestampLabel(pollsTransitionType)
    : 'Report Created At';

  return (
    <div>
      <ReportElectionInfo election={election} />
      <ReportMetadata>
        <ColumnSpan>
          <LabeledValue label="Precinct" value={precinctName} />
          {timestamp && (
            <LabeledValue
              label={timestampLabel}
              value={formatFullDateTimeZone(DateTime.fromJSDate(timestamp), {
                includeWeekday: false,
                includeSeconds: true,
              })}
            />
          )}
          <LabeledValue label="Scanner ID" value={machineId} />
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
          <TestModeBanner />
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
        sent to VxDesign.
        <br />
        <br /> Press &apos;Next&apos; on VxScan to send the next part.
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
  reportCreatedAt,
  pollsTransitionTime,
  election,
  precinctIds,
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
          ballotHash={ballotHash}
          machineId={machineId}
          reportCreatedAt={reportCreatedAt}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          precinctIds={precinctIds}
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
  reportCreatedAt,
  pollsTransitionTime,
  election,
  precinctIds,
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
          ballotHash={ballotHash}
          machineId={machineId}
          reportCreatedAt={reportCreatedAt}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          precinctIds={precinctIds}
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
  reportCreatedAt,
  pollsTransitionTime,
  election,
  precinctIds,
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
          ballotHash={ballotHash}
          machineId={machineId}
          reportCreatedAt={reportCreatedAt}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          precinctIds={precinctIds}
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
  reportCreatedAt,
  pollsTransitionTime,
  election,
  precinctIds,
  votingType,
  pollsTransitionType,
  numPages,
  pageIndex,
}: ReportDetailsProps & {
  isLive: boolean;
  numPages: number;
  pageIndex: number;
}): JSX.Element {
  const reportTitle = getPollsReportTitle('close_polls');
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
          ballotHash={ballotHash}
          machineId={machineId}
          reportCreatedAt={reportCreatedAt}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          precinctIds={precinctIds}
          votingType={votingType}
          pollsTransitionType={pollsTransitionType}
        />
      </MainContent>
    </ResultsScreen>
  );
}

function PrecinctTallyReport({
  election,
  precinctId,
  contestResults,
}: {
  election: Election;
  precinctId: PrecinctId;
  contestResults: Record<ContestId, Tabulation.ContestResults>;
}): JSX.Element {
  const precinctSelection = singlePrecinctSelectionFor(precinctId);
  const contestsForPrecinct = getContestsForPrecinctAndElection(
    election,
    precinctSelection
  );
  const contestsByParty = groupContestsByParty(election, contestsForPrecinct);
  const partyNamesById = election.parties.reduce<Record<string, string>>(
    (acc, party) => ({ ...acc, [party.id]: party.fullName }),
    {}
  );

  return (
    <div>
      {contestsByParty.map(({ partyId, contests }) => (
        <div key={partyId || 'nonpartisan'}>
          {partyId && <h2>{partyNamesById[partyId]} Contests</h2>}
          {!partyId && contestsByParty.length > 1 && (
            <h2>Nonpartisan Contests</h2>
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
    </div>
  );
}

function AllPrecinctsTallyReport({
  election,
  contestResults,
}: {
  election: Election;
  contestResults: Record<ContestId, Tabulation.ContestResults>;
}): JSX.Element {
  const contestsForPrecinct = getContestsForPrecinctAndElection(
    election,
    ALL_PRECINCTS_SELECTION
  );
  const contestsByParty = groupContestsByParty(election, contestsForPrecinct);
  const partyNamesById = election.parties.reduce<Record<string, string>>(
    (acc, party) => ({ ...acc, [party.id]: party.fullName }),
    {}
  );

  return (
    <div>
      {contestsByParty.map(({ partyId, contests }) => (
        <div key={partyId || 'nonpartisan'}>
          {partyId && <h2>{partyNamesById[partyId]} Contests</h2>}
          {!partyId && contestsByParty.length > 1 && (
            <h2>Nonpartisan Contests</h2>
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
    </div>
  );
}

function PollsClosedReportConfirmation({
  ballotHash,
  machineId,
  isLive,
  reportCreatedAt,
  pollsTransitionTime,
  election,
  precinctIds,
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
  const reportTitle = getPollsReportTitle('close_polls');

  return (
    <ResultsScreen screenTitle={`${reportTitle} Sent`}>
      <MainContent>
        <ReportHeader reportTitle={reportTitle} isLive={isLive} />
        <ReportDetails
          ballotHash={ballotHash}
          machineId={machineId}
          reportCreatedAt={reportCreatedAt}
          pollsTransitionTime={pollsTransitionTime}
          election={election}
          precinctIds={precinctIds}
          votingType={votingType}
          pollsTransitionType={pollsTransitionType}
        />
        {Object.entries(contestResultsByPrecinct).map(
          ([precinctKey, contestResults]) => {
            const precinct = election.precincts.find(
              (p) => p.id === precinctKey
            );
            return (
              <div key={precinctKey}>
                {Object.keys(contestResultsByPrecinct).length > 1 &&
                  precinct && <h2>{precinct.name}</h2>}
                {precinct ? (
                  <PrecinctTallyReport
                    election={election}
                    precinctId={precinct.id}
                    contestResults={contestResults}
                  />
                ) : (
                  <AllPrecinctsTallyReport
                    election={election}
                    contestResults={contestResults}
                  />
                )}
              </div>
            );
          }
        )}
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
          reportCreatedAt={reportData.reportCreatedAt}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          precinctIds={reportData.precinctIds}
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
          reportCreatedAt={reportData.reportCreatedAt}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          precinctIds={reportData.precinctIds}
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
          reportCreatedAt={reportData.reportCreatedAt}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          precinctIds={reportData.precinctIds}
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
            reportCreatedAt={reportData.reportCreatedAt}
            pollsTransitionTime={reportData.pollsTransitionTime}
            election={reportData.election}
            precinctIds={reportData.precinctIds}
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
          reportCreatedAt={reportData.reportCreatedAt}
          pollsTransitionTime={reportData.pollsTransitionTime}
          election={reportData.election}
          precinctIds={reportData.precinctIds}
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
