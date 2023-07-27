import {
  ElectionDefinition,
  getPartyIdsWithContests,
  PrecinctSelection,
  StandardPollsTransition,
  Tabulation,
} from '@votingworks/types';
import {
  combineElectionResults,
  getEmptyElectionResults,
  getRelevantContests,
} from '@votingworks/utils';
import React from 'react';
import { PrecinctScannerTallyQrCode } from './precinct_scanner_tally_qrcode';
import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report';

export interface PrecinctScannerTallyReportsProps {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  electionResultsByParty: Tabulation.GroupList<Tabulation.ElectionResults>;
  pollsTransition: StandardPollsTransition;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  precinctScannerMachineId: string;
  signedQuickResultsReportingUrl: string;
  totalBallotsScanned: number;
}

/**
 * A tally report for each party. Additionally, the VxQR code page if applicable.
 */
export function PrecinctScannerTallyReports({
  electionDefinition,
  precinctSelection,
  electionResultsByParty,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  precinctScannerMachineId,
  signedQuickResultsReportingUrl,
  totalBallotsScanned,
}: PrecinctScannerTallyReportsProps): JSX.Element {
  const currentTime = Date.now();
  const { election } = electionDefinition;
  const combinedResults = combineElectionResults({
    election,
    allElectionResults: electionResultsByParty,
  });
  const partyIds = getPartyIdsWithContests(electionDefinition.election);
  const allContests = getRelevantContests({
    election,
    filter: {
      precinctIds:
        precinctSelection.kind === 'SinglePrecinct'
          ? [precinctSelection.precinctId]
          : undefined,
    },
  });
  const showQuickResults =
    electionDefinition.election.quickResultsReportingUrl &&
    totalBallotsScanned > 0 &&
    pollsTransition === 'close_polls';

  return (
    <React.Fragment>
      {partyIds.map((partyId) => {
        const electionResults = partyId
          ? electionResultsByParty.find(
              (results) => results.partyId === partyId
            ) || getEmptyElectionResults(electionDefinition.election, true)
          : combinedResults;
        const contests = partyId
          ? allContests.filter(
              (c) => c.type === 'candidate' && c.partyId === partyId
            )
          : allContests.filter((c) => c.type === 'yesno' || !c.partyId);
        return (
          <PrecinctScannerTallyReport
            key={`tally-report-${partyId}`}
            electionDefinition={electionDefinition}
            contests={contests}
            scannedElectionResults={electionResults}
            precinctSelection={precinctSelection}
            partyId={partyId}
            pollsTransition={pollsTransition}
            isLiveMode={isLiveMode}
            pollsTransitionedTime={pollsTransitionedTime}
            currentTime={currentTime}
            precinctScannerMachineId={precinctScannerMachineId}
          />
        );
      })}
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
