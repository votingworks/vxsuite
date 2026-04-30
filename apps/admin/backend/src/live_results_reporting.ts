import { generateSignedQuickResultsReportingUrl } from '@votingworks/auth';
import { assert, assertDefined, err, ok, Result } from '@votingworks/basics';
import {
  Id,
  PollingPlace,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
  PrecinctId,
  Tabulation,
} from '@votingworks/types';
import {
  getBallotCount,
  groupMapToGroupList,
  mergeWriteInTallies,
} from '@votingworks/utils';
import { Store } from './store';
import { tabulateElectionResults } from './tabulation/full_results';
import { tabulateFullCardCounts } from './tabulation/card_counts';

/**
 * Returns the absentee polling places whose precinct coverage is a superset
 * of the precincts that have at least one loaded CVR (or manual tally).
 * Returns `err('no-cvrs-loaded')` if no precinct has any ballots.
 */
export function getMatchingAbsenteePollingPlaces({
  electionId,
  store,
}: {
  electionId: Id;
  store: Store;
}): Result<PollingPlace[], 'no-cvrs-loaded'> {
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const cardCountsByPrecinct = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
      groupBy: { groupByPrecinct: true },
    })
  );

  const precinctsWithBallots = new Set<PrecinctId>();
  for (const group of cardCountsByPrecinct) {
    assert(group.precinctId !== undefined);
    if (getBallotCount(group) > 0) {
      precinctsWithBallots.add(group.precinctId);
    }
  }

  if (precinctsWithBallots.size === 0) {
    return err('no-cvrs-loaded');
  }

  const absenteePollingPlaces = (
    election.pollingPlaces ?? /* istanbul ignore next - @preserve */ []
  ).filter((place) => place.type === 'absentee');
  const matches = absenteePollingPlaces.filter((place) => {
    const placePrecinctIds = pollingPlacePrecinctIds(place);
    for (const precinctId of precinctsWithBallots) {
      if (!placePrecinctIds.has(precinctId)) {
        return false;
      }
    }
    return true;
  });

  return ok(matches);
}

/**
 * Tabulates per-precinct results for the given absentee polling place and
 * returns signed live results reporting URLs for QR code display. Callers
 * are expected to pass a polling place returned from
 * {@link getMatchingAbsenteePollingPlaces}; the screen that triggers this
 * function is gated on `systemSettings.quickResultsReportingUrl` being set.
 */
export async function generateAdminLiveResultsReportingUrls({
  electionId,
  store,
  pollingPlaceId,
  signingMachineId,
  pollsTransitionTimestamp,
}: {
  electionId: Id;
  store: Store;
  pollingPlaceId: string;
  signingMachineId: string;
  pollsTransitionTimestamp: number;
}): Promise<string[]> {
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;
  const systemSettings = store.getSystemSettings(electionId);
  assert(
    systemSettings.quickResultsReportingUrl !== undefined,
    'Live results reporting URL is not configured'
  );

  const pollingPlace = pollingPlaceFromElection(election, pollingPlaceId);
  assert(pollingPlace.type === 'absentee');

  const groupedResults = groupMapToGroupList(
    await tabulateElectionResults({
      electionId,
      store,
      groupBy: { groupByPrecinct: true },
      includeWriteInAdjudicationResults: true,
      includeManualResults: true,
    })
  );

  const placePrecinctIds = pollingPlacePrecinctIds(pollingPlace);
  const resultsByPrecinct: Record<PrecinctId, Tabulation.ElectionResults> = {};
  for (const result of groupedResults) {
    assert(result.precinctId !== undefined);
    if (getBallotCount(result.cardCounts) === 0) continue;
    assert(
      placePrecinctIds.has(result.precinctId),
      `Polling place ${pollingPlaceId} does not cover precinct ${result.precinctId}`
    );
    resultsByPrecinct[result.precinctId] = mergeWriteInTallies(result);
  }

  return generateSignedQuickResultsReportingUrl({
    electionDefinition,
    quickResultsReportingUrl: systemSettings.quickResultsReportingUrl,
    signingMachineId,
    isLiveMode: store.getCurrentCvrFileModeForElection(electionId) !== 'test',
    pollingPlaceId,
    resultsByPrecinct,
    pollsTransitionType: 'close_polls',
    votingType: 'absentee',
    pollsTransitionTimestamp,
  });
}
