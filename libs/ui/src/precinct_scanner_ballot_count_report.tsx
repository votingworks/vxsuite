import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import {
  formatFullDateTimeZone,
  getPollsStateName,
  getPollsTransitionActionPastTense,
  getPollsTransitionDestinationState,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';
import { Prose } from './prose';
import { PrintableContainer, ReportSection, TallyReport } from './tally_report';

const Contents = styled(Prose)`
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
  precinctSelection: PrecinctSelection;
  totalBallotsScanned: number;
  pollsTransition: 'pause_voting' | 'resume_voting';
  pollsTransitionedTime: number;
  currentTime: number;
  isLiveMode: boolean;
  precinctScannerMachineId: string;
}

export function PrecinctScannerBallotCountReport({
  electionDefinition,
  precinctSelection,
  totalBallotsScanned,
  pollsTransition,
  pollsTransitionedTime,
  currentTime,
  isLiveMode,
  precinctScannerMachineId,
}: Props): JSX.Element {
  return (
    <PrintableContainer data-testid="ballot-count-report">
      <TallyReport>
        <ReportSection>
          <PrecinctScannerReportHeader
            electionDefinition={electionDefinition}
            precinctSelection={precinctSelection}
            pollsTransition={pollsTransition}
            isLiveMode={isLiveMode}
            pollsTransitionedTime={pollsTransitionedTime}
            currentTime={currentTime}
            precinctScannerMachineId={precinctScannerMachineId}
          />
          <Contents>
            <dl>
              <div className="ballot-counts">
                <dt>Ballots Scanned Count</dt>
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
                <dt>
                  Time {getPollsTransitionActionPastTense(pollsTransition)}
                </dt>
                <dd>
                  {formatFullDateTimeZone(
                    DateTime.fromMillis(pollsTransitionedTime)
                  )}
                </dd>
              </div>
            </dl>
          </Contents>
        </ReportSection>
      </TallyReport>
    </PrintableContainer>
  );
}
