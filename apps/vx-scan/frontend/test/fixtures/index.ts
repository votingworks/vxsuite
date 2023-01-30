import {
  AdjudicationInfo,
  AdjudicationReason,
  BallotType,
  CandidateContest,
  ElectionDefinition,
  InterpretedHmpbPage,
} from '@votingworks/types';
import { find } from '@votingworks/basics';

export function interpretedHmpb({
  electionDefinition,
  pageNumber,
  adjudicationReason,
}: {
  electionDefinition: ElectionDefinition;
  pageNumber: number;
  adjudicationReason?: AdjudicationReason;
}): InterpretedHmpbPage {
  const contest = find(
    electionDefinition.election.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const enabledReasonInfos: AdjudicationInfo['enabledReasonInfos'] =
    adjudicationReason === AdjudicationReason.Overvote
      ? [
          {
            type: adjudicationReason,
            contestId: contest.id,
            optionIds: contest.candidates.map(({ id }) => id),
            optionIndexes: contest.candidates.map((c, i) => i),
            expected: contest.seats,
          },
        ]
      : adjudicationReason === AdjudicationReason.BlankBallot
      ? [{ type: adjudicationReason }]
      : [];
  return {
    type: 'InterpretedHmpbPage',
    adjudicationInfo: {
      enabledReasonInfos,
      enabledReasons: [
        AdjudicationReason.Overvote,
        AdjudicationReason.BlankBallot,
      ],
      ignoredReasonInfos: [],
      requiresAdjudication:
        adjudicationReason === AdjudicationReason.Overvote ||
        adjudicationReason === AdjudicationReason.BlankBallot,
    },
    markInfo: { ballotSize: { width: 1, height: 1 }, marks: [] },
    metadata: {
      ballotStyleId: electionDefinition.election.ballotStyles[0].id,
      precinctId: electionDefinition.election.precincts[0].id,
      electionHash: electionDefinition.electionHash,
      ballotType: BallotType.Standard,
      isTestMode: true,
      locales: { primary: 'en-US' },
      pageNumber,
    },
    votes: {},
  };
}
