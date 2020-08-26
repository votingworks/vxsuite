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
} from '@votingworks/ballot-encoder'
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
  eitherNeither: YesNoOption,
  pickOne: YesNoOption
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
    votes[contest.eitherNeitherContestId] = [
      ...(votes[contest.eitherNeitherContestId] ?? []),
      candidateOrYesNoOrEitherNeither.id === contest.eitherOption.id
        ? 'yes'
        : 'no',
    ] as YesNoVote
    votes[contest.pickOneContestId] = [
      ...(votes[contest.pickOneContestId] ?? []),
      candidateOrYesNoOrEitherNeither.id === contest.firstOption.id
        ? 'yes'
        : 'no',
    ] as YesNoVote
  } else {
    throw new Error(
      `Invalid vote for '${contest.type}' contest type: ${inspect(
        candidateOrYesNoOrEitherNeither
      )}`
    )
  }
}
