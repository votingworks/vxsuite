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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const contest = electionDefinition.election.contests[0]!;
  let votes: VotesDict = {};
  if (contest.type === 'candidate') {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const candidate = contest.candidates[0]!;
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
      [contest.title]: [contest.options[0].id],
    };
  }

  return {
    type: 'InterpretedBmdPage',
    metadata: {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      ballotStyleId: electionDefinition.election.ballotStyles[0]!.id,
      ballotHash: electionDefinition.ballotHash,
      isTestMode: true,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      precinctId: electionDefinition.election.precincts[0]!.id,
      ballotType: BallotType.Precinct,
      pageNumber: 1,
      totalPages: 1,
      ballotAuditId: 'mock-audit-id',
      contestIds: [contest.id],
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
