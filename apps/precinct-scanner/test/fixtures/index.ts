import {
  AdjudicationInfo,
  AdjudicationReason,
  BallotType,
  CandidateContest,
  ElectionDefinition,
  InterpretedHmpbPage,
} from '@votingworks/types'
import { find } from '@votingworks/utils'

export function interpretedHmpb({
  electionDefinition,
  pageNumber,
  adjudicationReason,
}: {
  electionDefinition: ElectionDefinition
  pageNumber: number
  adjudicationReason?: AdjudicationReason
}): InterpretedHmpbPage {
  const contest = find(
    electionDefinition.election.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  )
  const allReasonInfos: AdjudicationInfo['allReasonInfos'] =
    adjudicationReason === AdjudicationReason.Overvote
      ? [
          {
            type: adjudicationReason,
            contestId: contest.id,
            optionIds: contest.candidates.map(({ id }) => id),
            expected: contest.seats,
          },
        ]
      : adjudicationReason === AdjudicationReason.BlankBallot
      ? [
          {
            type: adjudicationReason,
          },
        ]
      : []
  return {
    type: 'InterpretedHmpbPage',
    adjudicationInfo: {
      allReasonInfos,
      enabledReasons: [
        AdjudicationReason.Overvote,
        AdjudicationReason.BlankBallot,
      ],
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
  }
}
