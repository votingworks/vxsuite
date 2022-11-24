import {
  ElectionDefinition,
  getPartyIdsInBallotStyles,
  PrecinctSelection,
  StandardPollsTransition,
  Tally,
} from '@votingworks/types';
import {
  assert,
  getTallyIdentifier,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import React from 'react';
import { PrecinctScannerTallyQrCode } from './precinct_scanner_tally_qrcode';
import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report';

export interface PrecinctScannerTallyReportsProps {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  hasPrecinctSubTallies?: boolean;
  subTallies: ReadonlyMap<string, Tally>;
  pollsTransition: StandardPollsTransition;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  precinctScannerMachineId: string;
  signedQuickResultsReportingUrl: string;
  totalBallotsScanned: number;
}

/**
 * A tally report for each precinct and party represented in the scanner's
 * results. Additionally, the VxQR code page if applicable.
 */
export function PrecinctScannerTallyReports({
  electionDefinition,
  precinctSelection,
  hasPrecinctSubTallies,
  subTallies,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  precinctScannerMachineId,
  signedQuickResultsReportingUrl,
  totalBallotsScanned,
}: PrecinctScannerTallyReportsProps): JSX.Element {
  const currentTime = Date.now();
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
