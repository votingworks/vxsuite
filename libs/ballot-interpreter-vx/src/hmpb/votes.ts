import {
  CandidateId,
  CandidateVote,
  ContestId,
  Election,
  VotesDict,
  WriteInCandidate,
  YesNoOption,
  YesNoOptionId,
  YesNoVote,
} from '@votingworks/types';
import { assert, find, throwIllegalValue } from '@votingworks/basics';

export function addVote(
  election: Election,
  votes: VotesDict,
  contestId: ContestId,
  option: CandidateId | 'yes' | 'no' | YesNoOptionId | WriteInCandidate
): void;
export function addVote(
  election: Election,
  votes: VotesDict,
  contestId: ContestId,
  option:
    | WriteInCandidate
    | 'yes'
    | 'no'
    | YesNoOption
    | CandidateId
    | YesNoOptionId
): void {
  const contest = find(election.contests, (c) => c.id === contestId);
  /* eslint-disable no-param-reassign */
  if (contest.type === 'candidate') {
    const candidate =
      typeof option === 'string'
        ? find(contest.candidates, (c) => c.id === option)
        : option;
    votes[contest.id] = [
      ...(votes[contest.id] ?? []),
      candidate,
    ] as CandidateVote;
  } else if (contest.type === 'yesno') {
    assert(typeof option === 'string');
    const yesNo = option;
    votes[contest.id] = [...(votes[contest.id] ?? []), yesNo] as YesNoVote;
  } else if (contest.type === 'ms-either-neither') {
    const optionId = typeof option === 'string' ? option : option.id;
    switch (optionId) {
      case contest.eitherOption.id:
        votes[contest.eitherNeitherContestId] = [
          ...(votes[contest.eitherNeitherContestId] ?? []),
          'yes',
        ] as YesNoVote;
        break;

      case contest.neitherOption.id:
        votes[contest.eitherNeitherContestId] = [
          ...(votes[contest.eitherNeitherContestId] ?? []),
          'no',
        ] as YesNoVote;
        break;

      case contest.firstOption.id:
        votes[contest.pickOneContestId] = [
          ...(votes[contest.pickOneContestId] ?? []),
          'yes',
        ] as YesNoVote;
        break;

      case contest.secondOption.id:
        votes[contest.pickOneContestId] = [
          ...(votes[contest.pickOneContestId] ?? []),
          'no',
        ] as YesNoVote;
        break;

      default:
        throw new Error(
          `unexpected option in ${contest.type} contest: ${optionId}`
        );
    }
  } else {
    throwIllegalValue(contest, 'type');
  }
  /* eslint-enable no-param-reassign */
}
