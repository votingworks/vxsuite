import {
  ElectionDefinition,
  PartyId,
  PrecinctSelection,
  StandardPollsTransition,
  Tally,
} from '@votingworks/types';
import React from 'react';
import { ContestTally } from './contest_tally';
import { PrecinctScannerReportHeader } from './precinct_scanner_report_header';
import {
  PrintableContainer,
  ReportSection,
  TallyReport,
  TallyReportColumns,
} from './tally_report';
import { TallyReportSummary } from './tally_report_summary';

interface Props {
  electionDefinition: ElectionDefinition;
  partyId?: PartyId;
  precinctSelection: PrecinctSelection;
  tally: Tally;
  pollsTransition: StandardPollsTransition;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  currentTime: number;
  precinctScannerMachineId: string;
}

/**
 * A single tally report representing a single precinct selection and party
 * selection, which could be "All Precincts" and "No Party" respectively.
 */
export function PrecinctScannerTallyReport({
  electionDefinition,
  partyId,
  precinctSelection,
  tally,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  currentTime,
  precinctScannerMachineId,
}: Props): JSX.Element {
  const { election } = electionDefinition;
  const precinctId =
    precinctSelection.kind === 'SinglePrecinct'
      ? precinctSelection.precinctId
      : undefined;

  return (
    <PrintableContainer data-testid={`tally-report-${partyId}-${precinctId}`}>
      <TallyReport>
        <ReportSection>
          <PrecinctScannerReportHeader
            electionDefinition={electionDefinition}
            partyId={partyId}
            precinctSelection={precinctSelection}
            pollsTransition={pollsTransition}
            isLiveMode={isLiveMode}
            pollsTransitionedTime={pollsTransitionedTime}
            currentTime={currentTime}
            precinctScannerMachineId={precinctScannerMachineId}
          />
          <TallyReportColumns>
            <TallyReportSummary
              totalBallotCount={tally.numberOfBallotsCounted}
              ballotCountsByVotingMethod={tally.ballotCountsByVotingMethod}
              election={election}
            />
            <ContestTally
              election={election}
              scannedTally={tally}
              precinctId={precinctId}
            />
          </TallyReportColumns>
        </ReportSection>
      </TallyReport>
    </PrintableContainer>
  );
}
