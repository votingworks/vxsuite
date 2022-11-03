import {
  ElectionDefinition,
  getPartyIdsInBallotStyles,
  PollsTransition,
  PrecinctSelection,
  Tally,
} from '@votingworks/types';
import {
  assert,
  getTallyIdentifier,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import React from 'react';
import { PrecinctScannerBallotCountReport } from './precinct_scanner_ballot_count_report';
import { PrecinctScannerTallyQrCode } from './precinct_scanner_tally_qrcode';
import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report';

export interface PrecinctScannerFullReportProps {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  hasPrecinctSubTallies?: boolean;
  subTallies: ReadonlyMap<string, Tally>;
  pollsTransition: PollsTransition;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  currentTime: number;
  precinctScannerMachineId: string;
  signedQuickResultsReportingUrl: string;
  totalBallotsScanned: number;
}

export function PrecinctScannerFullReport({
  electionDefinition,
  precinctSelection,
  hasPrecinctSubTallies,
  subTallies,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  currentTime,
  precinctScannerMachineId,
  signedQuickResultsReportingUrl,
  totalBallotsScanned,
}: PrecinctScannerFullReportProps): JSX.Element {
  const showTallies =
    pollsTransition === 'open_polls' || pollsTransition === 'close_polls';

  if (!showTallies) {
    return (
      <PrecinctScannerBallotCountReport
        electionDefinition={electionDefinition}
        precinctSelection={precinctSelection}
        pollsTransition={pollsTransition}
        totalBallotsScanned={totalBallotsScanned}
        isLiveMode={isLiveMode}
        pollsTransitionedTime={pollsTransitionedTime}
        currentTime={currentTime}
        precinctScannerMachineId={precinctScannerMachineId}
      />
    );
  }

  const parties = getPartyIdsInBallotStyles(electionDefinition.election);
  const showQuickResults =
    electionDefinition.election.quickResultsReportingUrl &&
    totalBallotsScanned > 0 &&
    pollsTransition === 'close_polls';

  const precinctSelectionList: PrecinctSelection[] =
    precinctSelection.kind === 'AllPrecincts' && hasPrecinctSubTallies
      ? electionDefinition.election.precincts.map(({ id }) =>
          singlePrecinctSelectionFor(id)
        )
      : [precinctSelection];

  return (
    <React.Fragment>
      {precinctSelectionList.map((tallyReportPrecinctSelection) =>
        parties.map((partyId) => {
          const tallyIdentifier = getTallyIdentifier(
            partyId,
            tallyReportPrecinctSelection.kind === 'SinglePrecinct'
              ? tallyReportPrecinctSelection.precinctId
              : undefined
          );
          const tallyForReport = subTallies.get(tallyIdentifier);
          assert(tallyForReport);
          return (
            <PrecinctScannerTallyReport
              key={tallyIdentifier}
              electionDefinition={electionDefinition}
              tally={tallyForReport}
              precinctSelection={tallyReportPrecinctSelection}
              partyId={partyId}
              pollsTransition={pollsTransition}
              isLiveMode={isLiveMode}
              pollsTransitionedTime={pollsTransitionedTime}
              currentTime={currentTime}
              precinctScannerMachineId={precinctScannerMachineId}
            />
          );
        })
      )}
      {showQuickResults && (
        <PrecinctScannerTallyQrCode
          pollsTransitionedTime={pollsTransitionedTime}
          election={electionDefinition.election}
          signedQuickResultsReportingUrl={signedQuickResultsReportingUrl}
        />
      )}
    </React.Fragment>
  );
}
