import {
  BallotType,
  InterpretedBmdMultiPagePage,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  PrecinctId,
  Tabulation,
  getGroupIdFromBallotStyleId,
} from '@votingworks/types';
import {
  combineElectionResults,
  convertVotesDictToTabulationVotes,
  getBallotCount,
  getBallotStyleIdPartyIdLookup,
  getGroupSpecifierFromGroupKey,
  groupMapToGroupList,
  tabulateCastVoteRecords,
} from '@votingworks/utils';
import {
  assert,
  assertDefined,
  iter,
  throwIllegalValue,
  typedAs,
} from '@votingworks/basics';
import { VX_MACHINE_ID } from '@votingworks/backend';
import memoizeOne from 'memoize-one';
import type { Store } from '../store';

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

export function isBmdMultiPagePage(
  interpretation: PageInterpretation
): interpretation is InterpretedBmdMultiPagePage {
  return interpretation.type === 'InterpretedBmdMultiPagePage';
}

export function isPageWithVotes(
  interpretation: PageInterpretation
): interpretation is
  | InterpretedHmpbPage
  | InterpretedBmdPage
  | InterpretedBmdMultiPagePage {
  const { type } = interpretation;
  switch (type) {
    case 'InterpretedHmpbPage':
    case 'InterpretedBmdPage':
    case 'InterpretedBmdMultiPagePage':
      return true;
    case 'BlankPage':
    case 'UnreadablePage':
    case 'InvalidBallotHashPage':
    case 'InvalidPrecinctPage':
    case 'InvalidTestModePage':
      return false;
    default:
      /* istanbul ignore next -- preserve */
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
      const frontBallotStyleGroupId = getGroupIdFromBallotStyleId({
        ballotStyleId: frontInterpretation.metadata.ballotStyleId,
        election,
      });

      return typedAs<Tabulation.CastVoteRecord>({
        votes: convertVotesDictToTabulationVotes({
          ...frontInterpretation.votes,
          ...backInterpretation.votes,
        }),
        card: {
          type: 'hmpb',
          sheetNumber,
        },
        batchId: resultSheet.batchId,
        scannerId: VX_MACHINE_ID,
        precinctId: frontInterpretation.metadata.precinctId,
        ballotStyleGroupId: frontBallotStyleGroupId,
        partyId: ballotStyleIdPartyIdLookup[frontBallotStyleGroupId],
        votingMethod:
          BALLOT_TYPE_TO_VOTING_METHOD[frontInterpretation.metadata.ballotType],
      });
    }

    // Handle multi-page BMD ballot pages
    if (
      isBmdMultiPagePage(frontInterpretation) ||
      isBmdMultiPagePage(backInterpretation)
    ) {
      const interpretation = isBmdMultiPagePage(frontInterpretation)
        ? frontInterpretation
        : (backInterpretation as InterpretedBmdMultiPagePage);
      const ballotStyleGroupId = getGroupIdFromBallotStyleId({
        ballotStyleId: interpretation.metadata.ballotStyleId,
        election,
      });

      return typedAs<Tabulation.CastVoteRecord>({
        votes: convertVotesDictToTabulationVotes(interpretation.votes),
        card: {
          type: 'bmd',
          // Include sheet number for multi-page BMD ballots to enable
          // proper sheet accounting (similar to HMPB)
          sheetNumber: interpretation.metadata.pageNumber,
        },
        batchId: resultSheet.batchId,
        scannerId: VX_MACHINE_ID,
        precinctId: interpretation.metadata.precinctId,
        ballotStyleGroupId,
        partyId: ballotStyleIdPartyIdLookup[ballotStyleGroupId],
        votingMethod:
          BALLOT_TYPE_TO_VOTING_METHOD[interpretation.metadata.ballotType],
      });
    }

    // we assume that we have a single-page BMD ballot if it's not an HMPB or multi-page BMD ballot
    const interpretation = isBmdPage(frontInterpretation)
      ? frontInterpretation
      : backInterpretation;
    assert(isBmdPage(interpretation));
    const bmdBallotStyleGroupId = getGroupIdFromBallotStyleId({
      ballotStyleId: interpretation.metadata.ballotStyleId,
      election,
    });

    return typedAs<Tabulation.CastVoteRecord>({
      votes: convertVotesDictToTabulationVotes(interpretation.votes),
      card: {
        type: 'bmd',
      },
      batchId: resultSheet.batchId,
      scannerId: VX_MACHINE_ID,
      precinctId: interpretation.metadata.precinctId,
      ballotStyleGroupId: bmdBallotStyleGroupId,
      partyId: ballotStyleIdPartyIdLookup[bmdBallotStyleGroupId],
      votingMethod:
        BALLOT_TYPE_TO_VOTING_METHOD[interpretation.metadata.ballotType],
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

/**
 * Returns per-precinct election results and total ballot count. For
 * primary elections, results within each precinct are combined across
 * parties.
 */
export async function getScannerResultsByPrecinct({
  store,
}: {
  store: Store;
}): Promise<{
  resultsByPrecinct: Record<PrecinctId, Tabulation.ElectionResults>;
  ballotCount: number;
}> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const cvrs = buildCvrsFromStore(store);

  const resultsByPrecinctGroupMap = await tabulateCastVoteRecords({
    election,
    groupBy: { groupByPrecinct: true },
    cvrs,
  });

  const resultsByPrecinct: Record<PrecinctId, Tabulation.ElectionResults> = {};
  let totalBallotCount = 0;

  for (const [groupKey, groupResults] of Object.entries(
    resultsByPrecinctGroupMap
  )) {
    const groupSpecifier = getGroupSpecifierFromGroupKey(groupKey);
    const { precinctId } = groupSpecifier;
    assert(precinctId !== undefined);
    const existing = resultsByPrecinct[precinctId];
    if (existing) {
      resultsByPrecinct[precinctId] = combineElectionResults({
        election,
        allElectionResults: [existing, groupResults],
      });
    } else {
      resultsByPrecinct[precinctId] = groupResults;
    }
  }

  for (const precinctResults of Object.values(resultsByPrecinct)) {
    totalBallotCount += getBallotCount(precinctResults.cardCounts);
  }

  return { resultsByPrecinct, ballotCount: totalBallotCount };
}
