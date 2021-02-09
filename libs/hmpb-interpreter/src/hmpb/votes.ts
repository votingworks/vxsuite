import {
  AnyContest,
  Candidate,
  CandidateContest,
  CandidateVote,
  MsEitherNeitherContest,
  VotesDict,
  YesNoContest,
  YesNoOption,
  YesNoVote,
} from '@votingworks/types'
import { inspect } from 'util'

export function addVote(
  votes: VotesDict,
  contest: CandidateContest,
  candidate: Candidate
): void
export function addVote(
  votes: VotesDict,
  contest: YesNoContest,
  yesNo: 'yes' | 'no'
): void
export function addVote(
  votes: VotesDict,
  contest: MsEitherNeitherContest,
  option: YesNoOption
): void
export function addVote(
  votes: VotesDict,
  contest: AnyContest,
  candidateOrYesNoOrEitherNeither: Candidate | 'yes' | 'no' | YesNoOption
): void {
  if (
    contest.type === 'candidate' &&
    typeof candidateOrYesNoOrEitherNeither === 'object'
  ) {
    votes[contest.id] = [
      ...(votes[contest.id] ?? []),
      candidateOrYesNoOrEitherNeither,
    ] as CandidateVote
  } else if (
    contest.type === 'yesno' &&
    typeof candidateOrYesNoOrEitherNeither === 'string'
  ) {
    votes[contest.id] = [
      ...(votes[contest.id] ?? []),
      candidateOrYesNoOrEitherNeither,
    ] as YesNoVote
  } else if (
    contest.type === 'ms-either-neither' &&
    typeof candidateOrYesNoOrEitherNeither === 'object'
  ) {
    switch (candidateOrYesNoOrEitherNeither.id) {
      case contest.eitherOption.id:
        votes[contest.eitherNeitherContestId] = [
          ...(votes[contest.eitherNeitherContestId] ?? []),
          'yes',
        ] as YesNoVote
        break

      case contest.neitherOption.id:
        votes[contest.eitherNeitherContestId] = [
          ...(votes[contest.eitherNeitherContestId] ?? []),
          'no',
        ] as YesNoVote
        break

      case contest.firstOption.id:
        votes[contest.pickOneContestId] = [
          ...(votes[contest.pickOneContestId] ?? []),
          'yes',
        ] as YesNoVote
        break

      case contest.secondOption.id:
        votes[contest.pickOneContestId] = [
          ...(votes[contest.pickOneContestId] ?? []),
          'no',
        ] as YesNoVote
        break

      default:
        throw new Error(
          `unexpected option in ${contest.type} contest: ${candidateOrYesNoOrEitherNeither.id}`
        )
    }
  } else {
    throw new Error(
      `Invalid vote for '${contest.type}' contest type: ${inspect(
        candidateOrYesNoOrEitherNeither
      )}`
    )
  }
}
