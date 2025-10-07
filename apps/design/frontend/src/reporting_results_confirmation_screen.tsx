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
  LabeledValue,
  ReportMetadata,
  Icons,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import { assert } from '@votingworks/basics';
import { formatBallotHash } from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getContestsForPrecinctAndElection,
  getPrecinctSelectionName,
  groupContestsByParty,
  maybeGetPrecinctIdFromSelection,
} from '@votingworks/utils';
import { processQrCodeReport } from './public_api';
import { Column } from './layout';

export function ResultsScreen({
  children,
}: {
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <Main flexColumn>
        <MainHeader>
          <h1>Results Reported</h1>
        </MainHeader>
        {children}
      </Main>
    </Screen>
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
        <ResultsScreen>
          <MainContent>
            <div>Signature NOT verified. Please try again.</div>
          </MainContent>
        </ResultsScreen>
      );
    }

    if (reportResult && reportResult.err() === 'no-election-found') {
      return (
        <ResultsScreen>
          <MainContent>
            <div>
              No Election Found for the provided Ballot Hash. Are you sure your
              machine is configured with the latest election package exported
              from VxDesign?
            </div>
          </MainContent>
        </ResultsScreen>
      );
    }
    return (
      <ResultsScreen>
        <MainContent>
          <div>Invalid Request</div>
        </MainContent>
      </ResultsScreen>
    );
  }

  if (isLoading || !reportResult) {
    return (
      <Screen>
        <Main centerChild>
          <LoadingAnimation />
        </Main>
      </Screen>
    );
  }

  const reportData = reportResult.ok();
  const { election, contestResults } = reportData;

  const precinctId = maybeGetPrecinctIdFromSelection(
    reportData.precinctSelection
  );
  const precinct = precinctId
    ? election.precincts.find((p) => p.id === precinctId)
    : undefined;
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    reportData.precinctSelection
  );
  const reportTitle = `Polls Closed Report • ${precinctName}`;

  const contestsForPrecinct = getContestsForPrecinctAndElection(
    election,
    reportData.precinctSelection
  );
  const [contestsByParty, nonPartisanContests] =
    groupContestsByParty(contestsForPrecinct);
  const partiesById = Object.fromEntries(
    election.parties.map((p) => [p.id, p])
  );

  return (
    <ResultsScreen>
      <MainContent>
        <div>
          <p>
            <Icons.Checkbox color="success" /> The results from this polling
            location have been verified and reported successfully.
          </p>
          <div style={{ marginTop: '20px' }}>
            <h2>{reportTitle}</h2>
            <ReportElectionInfo election={election} />
            <ReportMetadata>
              <Column>
                <LabeledValue
                  label="Report Created At"
                  value={formatFullDateTimeZone(
                    DateTime.fromJSDate(reportData.signedTimestamp),
                    { includeWeekday: false, includeSeconds: true }
                  )}
                />
                <LabeledValue label="Scanner ID" value={reportData.machineId} />
                <LabeledValue
                  label="Election ID"
                  value={formatBallotHash(reportData.ballotHash)}
                />
              </Column>
            </ReportMetadata>
            {Object.keys(contestsByParty).map((partyId) => (
              <div key={`partyResults-${partyId}`}>
                <h2 key={`partyId-${partyId}`}>
                  {partiesById[partyId].fullName}
                </h2>
                <TallyReportColumns>
                  {contestsByParty[partyId].map((contest) => {
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
            {Object.keys(contestsByParty).length > 0 &&
              nonPartisanContests.length > 0 && <h2> Nonpartisan Contests</h2>}
            <TallyReportColumns>
              {nonPartisanContests.map((contest) => {
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
        </div>
      </MainContent>
    </ResultsScreen>
  );
}
