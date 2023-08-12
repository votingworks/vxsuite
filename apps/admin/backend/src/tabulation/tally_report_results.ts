import { ElectionDefinition, Id, Tabulation } from '@votingworks/types';
import { assertDefined, mapObject } from '@votingworks/basics';
import {
  combineElectionResults,
  combineManualElectionResults,
  getEmptyElectionResults,
  mergeTabulationGroupMaps,
  mergeWriteInTallies,
  resolveFilterToFundamentalFilter,
  resolveFundamentalGroupMap,
  resolveGroupByToFundamentalGroupBy,
} from '@votingworks/utils';
import { Store } from '../store';
import { rootDebug } from '../util/debug';
import { tabulateElectionResults } from './full_results';
import { tabulateManualResults } from './manual_results';
import { TallyReportResults } from '../types';

const debug = rootDebug.extend('tabulation');

function combineTallyReportResults(
  allTallyReportResults: TallyReportResults[],
  electionDefinition: ElectionDefinition
): TallyReportResults {
  const { election } = electionDefinition;
  const allManualResults = allTallyReportResults
    .map(({ manualResults }) => manualResults)
    .filter(
      (manualResults): manualResults is Tabulation.ManualElectionResults =>
        manualResults !== undefined
    );
  return {
    scannedResults: combineElectionResults({
      election,
      allElectionResults: allTallyReportResults.map(
        ({ scannedResults }) => scannedResults
      ),
    }),
    manualResults:
      allManualResults.length > 0
        ? combineManualElectionResults({
            election,
            allManualResults,
          })
        : undefined,
  };
}

type TallyReportResultsGroupMap =
  Tabulation.FundamentalGroupMap<TallyReportResults>;

/**
 * Tabulates grouped tally reports for an election. This includes scanned results
 * adjusted with write-in adjudication data (but combining all unofficial write-ins)
 * and manual results separately.
 */
export async function tabulateTallyReportResults({
  electionId,
  store,
  filter = {},
  groupBy = {},
}: {
  electionId: Id;
  store: Store;
  filter?: Tabulation.Filter;
  groupBy?: Tabulation.GroupBy;
}): Promise<Tabulation.GroupList<TallyReportResults>> {
  const { electionDefinition } = assertDefined(store.getElection(electionId));
  const { election } = electionDefinition;

  const scannerBatches = store.getScannerBatches(electionId);

  const fundamentalFilter = resolveFilterToFundamentalFilter(
    filter,
    electionDefinition,
    scannerBatches
  );
  const fundamentalGroupBy = resolveGroupByToFundamentalGroupBy(groupBy);

  debug('tabulating scanned election results for tally report');
  const groupedScannedResults = mapObject(
    await tabulateElectionResults({
      electionId,
      store,
      filter: fundamentalFilter,
      groupBy: fundamentalGroupBy,
      includeWriteInAdjudicationResults: true,
      includeManualResults: false,
    }),
    mergeWriteInTallies
  );

  debug('tabulating manual election results for tally report');
  const manualResultsTabulationResult = tabulateManualResults({
    electionId,
    store,
    filter: fundamentalFilter,
    groupBy: fundamentalGroupBy,
  });

  if (manualResultsTabulationResult.isErr()) {
    debug('filter or group by is not compatible with manual results');
    const tallyReportResultsGroupMap = mapObject(
      groupedScannedResults,
      (scannedResults) => ({
        scannedResults,
      })
    );
    return resolveFundamentalGroupMap({
      groupBy,
      groupMap: tallyReportResultsGroupMap,
      scannerBatches,
      electionDefinition,
      combineFn: (allTallyReportResults) => ({
        scannedResults: combineElectionResults({
          election,
          allElectionResults: allTallyReportResults.map(
            ({ scannedResults }) => scannedResults
          ),
        }),
      }),
    });
  }

  const tallyReportResultsGroupMap: TallyReportResultsGroupMap =
    mergeTabulationGroupMaps(
      groupedScannedResults,
      manualResultsTabulationResult.ok(),
      (scannedResults, manualResults) => {
        return {
          scannedResults:
            scannedResults ?? getEmptyElectionResults(election, true),
          manualResults: manualResults
            ? mergeWriteInTallies(manualResults)
            : undefined,
        };
      }
    );

  return resolveFundamentalGroupMap({
    groupBy,
    groupMap: tallyReportResultsGroupMap,
    scannerBatches,
    electionDefinition,
    combineFn: (allTallyReportResults) =>
      combineTallyReportResults(allTallyReportResults, electionDefinition),
  });
}
