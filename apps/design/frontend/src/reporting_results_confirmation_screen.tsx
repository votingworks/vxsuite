import { useEffect } from 'react';
import {
  LoadingAnimation,
  Main,
  MainContent,
  MainHeader,
  Screen,
  TallyReportColumns,
  ContestResultsTable,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { formatBallotHash } from '@votingworks/types';
import {
  getContestsForPrecinctAndElection,
  maybeGetPrecinctIdFromSelection,
} from '@votingworks/utils';
import { processQrCodeReport } from './public_api';

export function ResultsScreen({
  children,
}: {
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <Screen flexDirection="row">
      <Main flexColumn>
        <MainHeader>
          <h1>Quick Results Reporting</h1>
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

  const contestsForPrecinct = getContestsForPrecinctAndElection(
    election,
    reportData.precinctSelection
  );

  return (
    <ResultsScreen>
      <MainContent>
        <div>
          <p>Thank you for reporting your election results!</p>
          <div style={{ marginTop: '20px' }}>
            <h2>Report Details</h2>
            <p>
              <strong>Ballot Hash:</strong>{' '}
              {formatBallotHash(reportData.ballotHash)}
            </p>
            <p>
              <strong>Machine ID:</strong> {reportData.machineId}
            </p>
            <p>
              <strong>Environment:</strong>{' '}
              {reportData.isLive ? 'Live' : 'Test'}
            </p>
            <p>
              <strong>Timestamp:</strong>{' '}
              {reportData.signedTimestamp.toLocaleString()}
            </p>
            <p>
              <strong>Precinct:</strong>{' '}
              {precinct ? precinct.name : 'All Precincts'}
            </p>
            <h2>Results Reported</h2>
            <TallyReportColumns>
              {contestsForPrecinct.map((contest) => {
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
