import { useEffect } from 'react';
import {
  LoadingAnimation,
  Main,
  MainContent,
  MainHeader,
  Screen,
} from '@votingworks/ui';
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
                ? String(reportData.precinctId)
                : 'Not specified'}
            </p>
            <details style={{ marginTop: '20px' }}>
              <summary>
                <strong>Tally Data</strong>
              </summary>
              <pre
                style={{
                  backgroundColor: '#f5f5f5',
                  padding: '10px',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(reportData.tally, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </MainContent>
    </ResultsScreen>
  );
}
