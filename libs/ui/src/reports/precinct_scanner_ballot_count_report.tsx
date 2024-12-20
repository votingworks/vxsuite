import {
  ElectionDefinition,
  PollsSuspensionTransitionType,
  PrecinctSelection,
} from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getPollsStateName,
  getPollsTransitionActionPastTense,
  getPollsTransitionDestinationState,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import styled, { ThemeProvider } from 'styled-components';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';
import { printedReportThemeFn, PrintedReport } from './layout';

const Contents = styled.div`
  padding-top: 2em;

  & dd {
    margin: 0 0 1em;
    font-size: 2em;
    font-weight: 600;
  }

  & dt {
    font-size: 1.5em;
  }

  & .ballot-counts {
    margin-bottom: 2em;

    & dd {
      margin-bottom: 0;
      font-size: 6em;
    }

    & dt {
      font-size: 3em;
    }
  }
`;

interface Props {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  precinctSelection: PrecinctSelection;
  totalBallotsScanned: number;
  pollsTransition: PollsSuspensionTransitionType;
  pollsTransitionedTime: number;
  reportPrintedTime: number;
  isLiveMode: boolean;
  precinctScannerMachineId: string;
}

export function PrecinctScannerBallotCountReport({
  electionDefinition,
  electionPackageHash,
  precinctSelection,
  totalBallotsScanned,
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
          precinctSelection={precinctSelection}
          pollsTransition={pollsTransition}
          isLiveMode={isLiveMode}
          pollsTransitionedTime={pollsTransitionedTime}
          reportPrintedTime={reportPrintedTime}
          precinctScannerMachineId={precinctScannerMachineId}
        />
        <Contents>
          <dl>
            <div className="ballot-counts">
              <dt>Sheets Scanned Count</dt>
              <dd>{totalBallotsScanned}</dd>
            </div>
            <div>
              <dt>Polls Status</dt>
              <dd>
                {getPollsStateName(
                  getPollsTransitionDestinationState(pollsTransition)
                )}
              </dd>
            </div>
            <div>
              <dt>Time {getPollsTransitionActionPastTense(pollsTransition)}</dt>
              <dd>
                {formatFullDateTimeZone(
                  DateTime.fromMillis(pollsTransitionedTime)
                )}
              </dd>
            </div>
          </dl>
        </Contents>
      </PrintedReport>
    </ThemeProvider>
  );
}
