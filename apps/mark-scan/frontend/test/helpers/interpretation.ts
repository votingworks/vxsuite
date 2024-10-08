import {
  BallotType,
  ElectionDefinition,
  InterpretedBmdPage,
  VotesDict,
} from '@votingworks/types';

// Returns a BMD page interpretation with a vote for the first option (candidate or yesOption) in the first contest of the provided election. Use when you just need a well-formed interpretation and the contents don't matter.
export function getMockInterpretation(
  electionDefinition: ElectionDefinition
): InterpretedBmdPage {
  const contest = electionDefinition.election.contests[0];
  let votes: VotesDict = {};
  if (contest.type === 'candidate') {
    const candidate = contest.candidates[0];
    votes = {
      [contest.title]: [
        {
          id: candidate.id,
          name: candidate.name,
          partyIds: candidate.partyIds,
        },
      ],
    };
  } else if (contest.type === 'yesno') {
    votes = {
      [contest.title]: [contest.yesOption.id],
    };
  }

  return {
    type: 'InterpretedBmdPage',
    metadata: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      ballotHash: electionDefinition.ballotHash,
      isTestMode: true,
      precinctId: electionDefinition.election.precincts[0].id,
      ballotType: BallotType.Precinct,
    },
    adjudicationInfo: {
      requiresAdjudication: false,
      ignoredReasonInfos: [],
      enabledReasonInfos: [],
      enabledReasons: [],
    },
    votes,
  };
}
