import {
  ElectionDefinition,
  getPartyIdsWithContests,
  PartyId,
  PrecinctSelection,
  StandardPollsTransitionType,
  Tabulation,
} from '@votingworks/types';
import {
  combineElectionResults,
  getContestsForPrecinct,
  getEmptyElectionResults,
} from '@votingworks/utils';
import { PrecinctScannerTallyReport } from './precinct_scanner_tally_report';

export function getPartyIdsForPrecinctScannerTallyReports(
  electionDefinition: ElectionDefinition
): Array<PartyId | undefined> {
  return getPartyIdsWithContests(electionDefinition.election);
}

export interface PrecinctScannerTallyReportsProps {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  precinctSelection: PrecinctSelection;
  electionResultsByParty: Tabulation.GroupList<Tabulation.ElectionResults>;
  pollsTransition: StandardPollsTransitionType;
  isLiveMode: boolean;
  pollsTransitionedTime: number;
  reportPrintedTime: number;
  precinctScannerMachineId: string;
}

/**
 * A tally report for each party.
 */
export function PrecinctScannerTallyReports({
  electionDefinition,
  electionPackageHash,
  precinctSelection,
  electionResultsByParty,
  pollsTransition,
  isLiveMode,
  pollsTransitionedTime,
  reportPrintedTime,
  precinctScannerMachineId,
}: PrecinctScannerTallyReportsProps): JSX.Element[] {
  const { election } = electionDefinition;
  const combinedResults = combineElectionResults({
    election,
    allElectionResults: electionResultsByParty,
  });
  const partyIds =
    getPartyIdsForPrecinctScannerTallyReports(electionDefinition);
  const allContests = getContestsForPrecinct(
    electionDefinition,
    precinctSelection.kind === 'SinglePrecinct'
      ? precinctSelection.precinctId
      : undefined
  );

  return partyIds.map((partyId) => {
    const electionResults = partyId
      ? electionResultsByParty.find((results) => results.partyId === partyId) ||
        getEmptyElectionResults(electionDefinition.election, true)
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
        electionPackageHash={electionPackageHash}
        contests={contests}
        scannedElectionResults={electionResults}
        precinctSelection={precinctSelection}
        partyId={partyId}
        pollsTransition={pollsTransition}
        isLiveMode={isLiveMode}
        pollsTransitionedTime={pollsTransitionedTime}
        reportPrintedTime={reportPrintedTime}
        precinctScannerMachineId={precinctScannerMachineId}
      />
    );
  });
}
