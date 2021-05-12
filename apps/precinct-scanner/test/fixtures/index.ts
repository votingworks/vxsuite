import {
  AdjudicationReason,
  BallotType,
  CandidateContest,
  ElectionDefinition,
} from '@votingworks/types'
import { AdjudicationInfo } from '../../src/config/ballot-review-types'
import { InterpretedHmpbPage } from '../../src/config/types'

export function interpretedHmpb({
  electionDefinition,
  pageNumber,
  adjudicationReason,
}: {
  electionDefinition: ElectionDefinition
  pageNumber: number
  adjudicationReason?: AdjudicationReason
}): InterpretedHmpbPage {
  const contest = electionDefinition.election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  )!
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
      : []
  return {
    type: 'InterpretedHmpbPage',
    adjudicationInfo: {
      allReasonInfos,
      enabledReasons: [AdjudicationReason.Overvote],
      requiresAdjudication: false,
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
