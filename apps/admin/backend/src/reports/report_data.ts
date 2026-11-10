import { assertDefined } from '@votingworks/basics';
import type { Admin, Tabulation } from '@votingworks/types';
import { groupMapToGroupList } from '@votingworks/utils';
import type { Store } from '../store.js';
import { tabulateFullCardCounts } from '../tabulation/card_counts.js';
import { tabulateTallyReportResults } from '../tabulation/tally_reports.js';
import { getOverallElectionWriteInSummary } from '../tabulation/write_ins.js';
import { convertFrontendFilter as convertFrontendFilterUtil } from '../util/filters.js';
import type { BallotCountReportSpec } from './ballot_count_report.js';
import type { TallyReportSpec } from './tally_report.js';

function loadCurrentElection(store: Store) {
  const electionId = assertDefined(
    store.getCurrentElectionId(),
    'machine not configured'
  );
  const {
    electionDefinition: { election },
  } = assertDefined(store.getElection(electionId));
  return { electionId, election };
}

/** Converts a frontend filter using the current election and its batches. */
export function convertFrontendFilter(
  store: Store,
  filter: Admin.FrontendReportingFilter
): Admin.ReportingFilter {
  const { electionId, election } = loadCurrentElection(store);
  return convertFrontendFilterUtil(
    filter,
    election,
    store.getScannerBatches(electionId)
  );
}

/** Tabulates tally report results for the current election. */
export async function getTallyReportResults(
  store: Store,
  input: Pick<TallyReportSpec, 'filter' | 'groupBy'>
): Promise<Tabulation.GroupList<Admin.TallyReportResults>> {
  const { electionId } = loadCurrentElection(store);
  return tabulateTallyReportResults({
    electionId,
    store,
    filter: convertFrontendFilter(store, input.filter),
    groupBy: input.groupBy,
  });
}

/** Tabulates card counts for the current election. */
export function getCardCounts(
  store: Store,
  input: Pick<BallotCountReportSpec, 'filter' | 'groupBy'>
): Tabulation.GroupList<Tabulation.CardCounts> {
  const { electionId, election } = loadCurrentElection(store);
  return groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      election,
      store,
      filter: convertFrontendFilter(store, input.filter),
      groupBy: input.groupBy,
    })
  );
}

/** Summarizes write-ins for the current election. */
export function getElectionWriteInSummary(
  store: Store
): Tabulation.ElectionWriteInSummary {
  const { electionId } = loadCurrentElection(store);
  return getOverallElectionWriteInSummary({ electionId, store });
}
