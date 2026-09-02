import {
  BallotMetadata,
  BallotType,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  PrecinctId,
  Tabulation,
  getGroupIdFromBallotStyleId,
  isCombinedBallotPrimary,
} from '@votingworks/types';
import {
  convertVotesDictToTabulationVotes,
  getBallotStyleIdPartyIdLookup,
  groupMapToGroupList,
  inferPartyFromVotes,
  tabulateCastVoteRecords,
} from '@votingworks/utils';
import {
  assert,
  assertDefined,
  iter,
  throwIllegalValue,
} from '@votingworks/basics';
import { createRequire } from 'node:module';
import { getMachineId } from '@votingworks/backend';
import type { Store } from '../store.js';

// `memoize-one` is CJS (`module.exports = fn`), but its types declare a
// `export default`. Under node16 that mismatch makes neither a default nor a
// namespace import resolve to the callable, so load it via require (which yields
// the raw `module.exports`) and type it from the default export.
const memoizeOne = createRequire(import.meta.url)(
  'memoize-one'
) as typeof import('memoize-one').default;

export function isHmpbPage(
  interpretation: PageInterpretation
): interpretation is InterpretedHmpbPage {
  return interpretation.type === 'InterpretedHmpbPage';
}

export function isBmdPage(
  interpretation: PageInterpretation
): interpretation is InterpretedBmdPage {
  return interpretation.type === 'InterpretedBmdPage';
}

export function isPageWithVotes(
  interpretation: PageInterpretation
): interpretation is InterpretedHmpbPage | InterpretedBmdPage {
  const { type } = interpretation;
  switch (type) {
    case 'InterpretedHmpbPage':
    case 'InterpretedBmdPage':
      return true;
    case 'BlankPage':
    case 'UnreadablePage':
    case 'InvalidBallotHashPage':
    case 'InvalidPrecinctPage':
    case 'InvalidTestModePage':
      return false;
    default:
      throwIllegalValue(type);
  }
}

const BALLOT_TYPE_TO_VOTING_METHOD: Record<
  BallotType,
  Tabulation.VotingMethod
> = {
  [BallotType.Absentee]: 'absentee',
  [BallotType.Precinct]: 'precinct',
  [BallotType.Provisional]: 'provisional',
};

function buildCvrsFromStore(store: Store): Iterable<Tabulation.CastVoteRecord> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  function buildCvr({
    card,
    votes,
    batchId,
    metadata,
  }: {
    card: Tabulation.Card;
    votes: Tabulation.Votes;
    batchId: string;
    metadata: BallotMetadata;
  }): Tabulation.CastVoteRecord {
    const ballotStyleGroupId = getGroupIdFromBallotStyleId({
      ballotStyleId: metadata.ballotStyleId,
      election,
    });
    return {
      votes,
      card,
      batchId,
      scannerId: getMachineId(),
      precinctId: metadata.precinctId,
      ballotStyleGroupId,
      partyId: isCombinedBallotPrimary(election)
        ? inferPartyFromVotes(election, votes)
        : ballotStyleIdPartyIdLookup[ballotStyleGroupId],
      votingMethod: BALLOT_TYPE_TO_VOTING_METHOD[metadata.ballotType],
    };
  }

  return iter(store.forEachAcceptedSheet()).map((resultSheet) => {
    const [frontInterpretation, backInterpretation] =
      resultSheet.interpretation;

    if (isHmpbPage(frontInterpretation)) {
      assert(isHmpbPage(backInterpretation));

      const sheetNumber = Math.round(
        Math.max(
          frontInterpretation.metadata.pageNumber,
          backInterpretation.metadata.pageNumber
        ) / 2
      );
      const votes = convertVotesDictToTabulationVotes({
        ...frontInterpretation.votes,
        ...backInterpretation.votes,
      });

      return buildCvr({
        votes,
        card: {
          type: 'hmpb',
          sheetNumber,
        },
        metadata: frontInterpretation.metadata,
        batchId: resultSheet.batchId,
      });
    }

    const interpretation = isBmdPage(frontInterpretation)
      ? frontInterpretation
      : backInterpretation;
    assert(isBmdPage(interpretation));
    const votes = convertVotesDictToTabulationVotes(interpretation.votes);

    return buildCvr({
      votes,
      card: {
        type: 'bmd',
        // Include sheet number to enable proper sheet accounting
        sheetNumber: interpretation.metadata.pageNumber,
      },
      batchId: resultSheet.batchId,
      metadata: interpretation.metadata,
    });
  });
}

type ScannerResultsByParty = Tabulation.GroupList<Tabulation.ElectionResults>;

export async function getScannerResults({
  store,
}: {
  store: Store;
}): Promise<ScannerResultsByParty> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const cvrs = buildCvrsFromStore(store);

  return groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      groupBy: election.type === 'primary' ? { groupByParty: true } : undefined,
      cvrs,
    })
  );
}

const getScannerResultsMemoizedByBallotCount = memoizeOne(
  (store: Store, _ballotCount: number) => getScannerResults({ store })
);

export function getScannerResultsMemoized({
  store,
}: {
  store: Store;
}): Promise<ScannerResultsByParty> {
  return getScannerResultsMemoizedByBallotCount(
    store,
    store.getBallotsCounted()
  );
}

async function getScannerResultsByPrecinct({
  store,
}: {
  store: Store;
}): Promise<Record<PrecinctId, Tabulation.ElectionResults>> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const cvrs = buildCvrsFromStore(store);

  const groupList = groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      groupBy: { groupByPrecinct: true },
      cvrs,
    })
  );

  const resultsByPrecinct: Record<PrecinctId, Tabulation.ElectionResults> = {};
  for (const result of groupList) {
    assert(result.precinctId !== undefined);
    resultsByPrecinct[result.precinctId] = result;
  }

  return resultsByPrecinct;
}

const getScannerResultsByPrecinctMemoizedByBallotCount = memoizeOne(
  (store: Store, _ballotCount: number) => getScannerResultsByPrecinct({ store })
);

/**
 * Returns per-precinct election results, memoized by ballot count.
 * For primary elections, results within each precinct are combined
 * across parties.
 */
export function getScannerResultsByPrecinctMemoized({
  store,
}: {
  store: Store;
}): Promise<Record<PrecinctId, Tabulation.ElectionResults>> {
  return getScannerResultsByPrecinctMemoizedByBallotCount(
    store,
    store.getBallotsCounted()
  );
}
