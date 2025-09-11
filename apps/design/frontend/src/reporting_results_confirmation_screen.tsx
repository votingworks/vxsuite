import { useEffect } from 'react';
import {
  LoadingAnimation,
  Main,
  MainContent,
  MainHeader,
  Screen,
} from '@votingworks/ui';
import { 
  getPrecinctById,
} from '@votingworks/types';
import { 
  format,
  getBallotCount,
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

  return (
    <ResultsScreen>
      <MainContent>
        <div>
          <p>Thank you for reporting your election results!</p>
          <div style={{ marginTop: '20px' }}>
            <h2>Report Details:</h2>
            <p>
              <strong>Election:</strong> {reportData.election.title}
            </p>
            <p>
              <strong>Ballot Hash:</strong> {reportData.ballotHash}
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
              {reportData.precinctId
                ? getPrecinctById({
                    election: reportData.election,
                    precinctId: reportData.precinctId.precinctId
                  })?.name || reportData.precinctId.precinctId
                : 'Not specified'}
            </p>
            <p>
              <strong>Total Ballots:</strong>{' '}
              {format.count(getBallotCount(reportData.tally.cardCounts))}
            </p>
            <details style={{ marginTop: '20px' }}>
              <summary>
                <strong>Election Results Summary</strong>
              </summary>
              <div style={{ marginTop: '10px' }}>
                <h3>Card Counts</h3>
                <ul>
                  <li>BMD Ballots: {format.count(reportData.tally.cardCounts.bmd)}</li>
                  <li>HMPB Ballots: {format.count(reportData.tally.cardCounts.hmpb[0] || 0)}</li>
                  {reportData.tally.cardCounts.manual && (
                    <li>Manual Ballots: {format.count(reportData.tally.cardCounts.manual)}</li>
                  )}
                </ul>
                
                <h3>Contest Results</h3>
                {Object.entries(reportData.tally.contestResults).map(([contestId, results]) => {
                  const contest = reportData.election.contests.find(c => c.id === contestId);
                  if (!contest) return null;
                  
                  return (
                    <details key={contestId} style={{ marginTop: '10px' }}>
                      <summary><strong>{contest.title}</strong></summary>
                      <div style={{ marginLeft: '20px', marginTop: '5px' }}>
                        <p>Ballots cast: {format.count(results.ballots)}</p>
                        <p>Undervotes: {format.count(results.undervotes)}</p>
                        <p>Overvotes: {format.count(results.overvotes)}</p>
                        
                        {results.contestType === 'candidate' && (
                          <div>
                            <strong>Vote Tallies:</strong>
                            <ul>
                              {Object.values(results.tallies).map((candidateTally) => (
                                <li key={candidateTally.id}>
                                  {candidateTally.name}: {format.count(candidateTally.tally)}
                                  {candidateTally.isWriteIn && ' (write-in)'}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {results.contestType === 'yesno' && (
                          <div>
                            <strong>Vote Tallies:</strong>
                            <ul>
                              <li>Yes: {format.count(results.yesTally)}</li>
                              <li>No: {format.count(results.noTally)}</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          </div>
        </div>
      </MainContent>
    </ResultsScreen>
  );
}
