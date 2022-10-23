import {
  ElectionDefinition,
  getPartyIdsInBallotStyles,
  PrecinctSelection,
  Tally,
} from '@votingworks/types';
import { assert, getTallyIdentifier } from '@votingworks/utils';
import React from 'react';
import { PrecinctScannerTallyQrCode } from './precinct_scanner_tally_qrcode';
import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report';

export interface PrecinctScannerFullReportProps {
  electionDefinition: ElectionDefinition;
  precinctSelectionList: PrecinctSelection[];
  subTallies: ReadonlyMap<string, Tally>;
  isPollsOpen: boolean;
  isLiveMode: boolean;
  pollsToggledTime: number;
  currentTime: number;
  precinctScannerMachineId: string;
  signedQuickResultsReportingUrl: string;
  totalBallotsScanned: number;
}

export function PrecinctScannerFullReport({
  electionDefinition,
  precinctSelectionList,
  subTallies,
  isPollsOpen,
  isLiveMode,
  pollsToggledTime,
  currentTime,
  precinctScannerMachineId,
  signedQuickResultsReportingUrl,
  totalBallotsScanned,
}: PrecinctScannerFullReportProps): JSX.Element {
  const parties = getPartyIdsInBallotStyles(electionDefinition.election);
  const showQuickResults =
    electionDefinition.election.quickResultsReportingUrl &&
    totalBallotsScanned > 0 &&
    !isPollsOpen;

  return (
    <React.Fragment>
      {precinctSelectionList.map((precinctSelection) =>
        parties.map((partyId) => {
          const tallyIdentifier = getTallyIdentifier(
            partyId,
            precinctSelection.kind === 'SinglePrecinct'
              ? precinctSelection.precinctId
              : undefined
          );
          const tallyForReport = subTallies.get(tallyIdentifier);
          assert(tallyForReport);
          return (
            <PrecinctScannerTallyReport
              key={tallyIdentifier}
              electionDefinition={electionDefinition}
              tally={tallyForReport}
              precinctSelection={precinctSelection}
              partyId={partyId}
              isPollsOpen={isPollsOpen}
              isLiveMode={isLiveMode}
              pollsToggledTime={pollsToggledTime}
              currentTime={currentTime}
              precinctScannerMachineId={precinctScannerMachineId}
            />
          );
        })
      )}
      {showQuickResults && (
        <PrecinctScannerTallyQrCode
          pollsToggledTime={pollsToggledTime}
          election={electionDefinition.election}
          isPollsOpen={isPollsOpen}
          signedQuickResultsReportingUrl={signedQuickResultsReportingUrl}
        />
      )}
    </React.Fragment>
  );
}
