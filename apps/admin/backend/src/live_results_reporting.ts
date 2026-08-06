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

/**
 * Returns the polling places that the loaded central scanner CVRs are
 * associated with via their batches, in election definition order. Returns
 * `err('no-cvrs-loaded')` if there are no central scanner CVRs.
 */
export function getLiveReportsPollingPlaces({
  electionId,
  store,
}: {
  electionId: Id;
  store: Store;
}): Result<PollingPlace[], 'no-cvrs-loaded'> {
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const pollingPlaceIds = new Set(
    store.getCentralScanPollingPlaceIds(electionId)
  );
  if (pollingPlaceIds.size === 0) {
    return err('no-cvrs-loaded');
  }

  const pollingPlaces = (
    election.pollingPlaces ?? /* @coverage-exclude */ []
  ).filter((place) => pollingPlaceIds.has(place.id));
  assert(
    pollingPlaces.length === pollingPlaceIds.size,
    'CVR batches reference polling places not in the election definition'
  );
  return ok(pollingPlaces);
}

/**
 * Tabulates per-precinct results from the central scanner batches associated
 * with the given polling place and returns signed live results reporting URLs
 * for QR code display. Results from precinct scanners, central scanner
 * batches for other polling places, and manual tallies are excluded since
 * they cannot be attributed to this polling place. Callers are expected to
 * pass a polling place returned from {@link getLiveReportsPollingPlaces}; the
 * screen that triggers this function is gated on
 * `systemSettings.quickResultsReportingUrl` being set.
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

  const batchIds = store
    .getScannerBatches(electionId)
    .filter(
      (batch) =>
        batch.scannerMachineType === 'central' &&
        batch.pollingPlaceId === pollingPlaceId
    )
    .map((batch) => batch.batchId);
  assert(
    batchIds.length > 0,
    `No central scanner batches found for polling place ${pollingPlaceId}`
  );

  const groupedResults = groupMapToGroupList(
    await tabulateElectionResults({
      electionId,
      store,
      filter: { batchIds },
      groupBy: { groupByPrecinct: true },
      includeWriteInAdjudicationResults: true,
      includeManualResults: false,
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
    pollsTransitionTimestamp,
  });
}
