import {
  BatchInfo,
  ElectionDefinition,
  PollsSuspensionTransitionType,
} from '@votingworks/types';
import styled, { ThemeProvider } from 'styled-components';
import { BatchSummaryTable } from './batch_summary_table';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';
import { printedReportThemeFn, PrintedReport } from './layout';

const Contents = styled.div`
  padding-top: 2em;
`;

const MetricsContainer = styled.div`
  align-items: center;
  display: grid;
  gap: 1.5rem;
  grid-template-columns: max-content 1fr;
  line-height: 1;
  margin: 0 0 1.5em;
`;

const Pair = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;
`;

const MetricValue = styled.span`
  font-size: 1.5rem;
  font-weight: bold;
`;

interface Props {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  pollingPlaceId?: string;
  totalBallotsScanned: number;
  mostRecentBatchCount?: number;
  batches: BatchInfo[];
  pollsTransition: PollsSuspensionTransitionType;
  pollsTransitionedTime: number;
  reportPrintedTime: number;
  isLiveMode: boolean;
  precinctScannerMachineId: string;
}

export function PrecinctScannerBallotCountReport({
  electionDefinition,
  electionPackageHash,
  pollingPlaceId,
  totalBallotsScanned,
  mostRecentBatchCount,
  batches,
  pollsTransition,
  pollsTransitionedTime,
  reportPrintedTime,
  isLiveMode,
  precinctScannerMachineId,
}: Props): JSX.Element {
  return (
    <ThemeProvider theme={printedReportThemeFn}>
      <PrintedReport data-testid="ballot-count-report">
        <PrecinctScannerReportHeader
          electionDefinition={electionDefinition}
          electionPackageHash={electionPackageHash}
          pollingPlaceId={pollingPlaceId}
          pollsTransition={pollsTransition}
          isLiveMode={isLiveMode}
          pollsTransitionedTime={pollsTransitionedTime}
          reportPrintedTime={reportPrintedTime}
          precinctScannerMachineId={precinctScannerMachineId}
        />
        <Contents>
          <MetricsContainer>
            <Pair>
              <span>Total Sheets Scanned:</span>
              <MetricValue>{totalBallotsScanned}</MetricValue>
            </Pair>
            {mostRecentBatchCount !== undefined && (
              <Pair>
                <span>Most Recent Batch:</span>
                <MetricValue>{mostRecentBatchCount}</MetricValue>
              </Pair>
            )}
          </MetricsContainer>
          <BatchSummaryTable batches={batches} />
        </Contents>
      </PrintedReport>
    </ThemeProvider>
  );
}
