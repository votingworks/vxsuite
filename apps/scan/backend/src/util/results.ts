import {
  BallotType,
  Candidate,
  InterpretedBmdPage,
  InterpretedHmpbPage,
  PageInterpretation,
  Tabulation,
  VotesDict,
  electionHasPrimaryContest,
} from '@votingworks/types';
import {
  groupMapToGroupList,
  tabulateCastVoteRecords,
} from '@votingworks/utils';
import { assert, iter, typedAs } from '@votingworks/basics';
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
  [BallotType.Standard]: 'precinct',
  [BallotType.Provisional]: 'provisional',
};

function convertVotesDictToTabulationVotes(
  votesDict: VotesDict
): Tabulation.Votes {
  const tabulationVotes: Tabulation.Votes = {};

  for (const [contestId, vote] of Object.entries(votesDict)) {
    assert(vote);

    if (vote.length === 0) {
      tabulationVotes[contestId] = [];
      continue;
    }

    const voteOption = vote[0];
    assert(voteOption !== undefined);

    if (typeof voteOption === 'string') {
      tabulationVotes[contestId] = vote as unknown as string[];
    } else {
      tabulationVotes[contestId] = vote.map((c) => (c as Candidate).id);
    }
  }

  return tabulationVotes;
}

export async function getScannerResults({
  store,
  splitByParty,
}: {
  store: Store;
  splitByParty: boolean;
}): Promise<Tabulation.GroupList<Tabulation.ElectionResults>> {
  const electionDefinition = store.getElectionDefinition();
  assert(electionDefinition);
  const { election } = electionDefinition;

  const isPrimaryElection = electionHasPrimaryContest(election);

  const cvrs = iter(store.forEachResultSheet()).map((resultSheet) => {
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
      votingMethod:
        BALLOT_TYPE_TO_VOTING_METHOD[interpretation.metadata.ballotType],
    });
  });

  return groupMapToGroupList(
    await tabulateCastVoteRecords({
      election,
      groupBy:
        isPrimaryElection && splitByParty ? { groupByParty: true } : undefined,
      cvrs,
    })
  );
}
