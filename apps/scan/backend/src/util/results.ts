import {
  BallotType,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  Tabulation,
} from '@votingworks/types';
import {
  convertVotesDictToTabulationVotes,
  getBallotStyleIdPartyIdLookup,
  groupMapToGroupList,
  tabulateCastVoteRecords,
} from '@votingworks/utils';
import { assert, assertDefined, iter, typedAs } from '@votingworks/basics';
import { VX_MACHINE_ID } from '@votingworks/backend';
import { Store } from '../store';

function isBmdPage(
  interpretation: PageInterpretation
): interpretation is InterpretedBmdPage {
  return interpretation.type === 'InterpretedBmdPage';
}

function isHmpbPage(
  interpretation: PageInterpretation
): interpretation is InterpretedHmpbPage {
  return interpretation.type === 'InterpretedHmpbPage';
}

const BALLOT_TYPE_TO_VOTING_METHOD: Record<
  BallotType,
  Tabulation.VotingMethod
> = {
  [BallotType.Absentee]: 'absentee',
  [BallotType.Precinct]: 'precinct',
  [BallotType.Provisional]: 'provisional',
};

export async function getScannerResults({
  store,
}: {
  store: Store;
}): Promise<Tabulation.GroupList<Tabulation.ElectionResults>> {
  const { electionDefinition } = assertDefined(store.getElectionRecord());
  const { election } = electionDefinition;
  const ballotStyleIdPartyIdLookup = getBallotStyleIdPartyIdLookup(election);

  const cvrs = iter(store.forEachAcceptedSheet()).map((resultSheet) => {
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
        ballotStyleId: frontInterpretation.metadata.ballotStyleId,
        partyId:
          ballotStyleIdPartyIdLookup[
            frontInterpretation.metadata.ballotStyleId
          ],
        votingMethod:
          BALLOT_TYPE_TO_VOTING_METHOD[frontInterpretation.metadata.ballotType],
      });
    }

    // we assume that we have a BMD ballot if it's not an HMPB ballot
    const interpretation = isBmdPage(frontInterpretation)
      ? frontInterpretation
      : backInterpretation;
    assert(isBmdPage(interpretation));

    return typedAs<Tabulation.CastVoteRecord>({
      votes: convertVotesDictToTabulationVotes(interpretation.votes),
      card: {
        type: 'bmd',
      },
      batchId: resultSheet.batchId,
      scannerId: VX_MACHINE_ID,
      precinctId: interpretation.metadata.precinctId,
      ballotStyleId: interpretation.metadata.ballotStyleId,
      partyId:
        ballotStyleIdPartyIdLookup[interpretation.metadata.ballotStyleId],
      votingMethod:
        BALLOT_TYPE_TO_VOTING_METHOD[interpretation.metadata.ballotType],
    });
  });

  return groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      groupBy: election.type === 'primary' ? { groupByParty: true } : undefined,
      cvrs,
    })
  );
}
