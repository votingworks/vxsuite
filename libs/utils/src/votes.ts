import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  BallotTargetMark,
  Candidate,
  CandidateContest,
  CandidateId,
  CandidateVote,
  Contests,
  MarkStatus,
  MarkThresholds,
  safeParse,
  safeParseInt,
  Vote,
  VotesDict,
  writeInCandidate,
  WriteInIdSchema,
  YesNoContest,
  YesNoVote,
  YesNoVoteId,
  YesOrNo,
} from '@votingworks/types';

export function getSingleYesNoVote(vote?: YesNoVote): YesOrNo | undefined {
  if (vote?.length === 1) {
    return vote[0];
  }
  return undefined;
}

export function normalizeWriteInId(candidateId: CandidateId): string {
  if (candidateId.startsWith('write-in')) {
    return writeInCandidate.id;
  }

  return candidateId;
}

/**
 * Gets all the vote options a voter can make for a given yes/no contest.
 */
export function getContestVoteOptionsForYesNoContest(
  contest: YesNoContest
): readonly YesNoVoteId[] {
  assert(contest.type === 'yesno');
  return ['yes', 'no'];
}

/**
 * Gets all the vote options a voter can make for a given contest. If write-ins are allowed a single write-in candidate ID is included.
 * @returns ContestVoteOption[] ex. ['yes', 'no'] or ['aaron', 'bob', 'write-in']
 */
export function getContestVoteOptionsForCandidateContest(
  contest: CandidateContest
): readonly Candidate[] {
  const options = contest.candidates;
  if (contest.allowWriteIns) {
    return options.concat(writeInCandidate);
  }
  return options;
}

type MarkThresholdsOptionalMarginal = Omit<MarkThresholds, 'marginal'> &
  Partial<Pick<MarkThresholds, 'marginal'>>;

export function getMarkStatus(
  markScore: BallotTargetMark['score'],
  markThresholds: MarkThresholds
): MarkStatus;
export function getMarkStatus(
  markScore: BallotTargetMark['score'],
  markThresholds: Omit<MarkThresholds, 'marginal'>
): Exclude<MarkStatus, MarkStatus.Marginal>;
export function getMarkStatus(
  markScore: BallotTargetMark['score'],
  markThresholds: MarkThresholdsOptionalMarginal
): MarkStatus {
  if (markScore >= markThresholds.definite) {
    return MarkStatus.Marked;
  }

  if (
    typeof markThresholds.marginal === 'number' &&
    markScore >= markThresholds.marginal
  ) {
    return MarkStatus.Marginal;
  }

  return MarkStatus.Unmarked;
}

function markToCandidateVotes(
  contest: CandidateContest,
  markThresholds: Pick<MarkThresholds, 'definite'>,
  mark: BallotTargetMark
): CandidateVote {
  assert(mark.type === 'candidate');
  if (getMarkStatus(mark.score, markThresholds) !== MarkStatus.Marked) {
    return [];
  }

  if (safeParse(WriteInIdSchema, mark.optionId).isOk()) {
    const indexedWriteInMatch = mark.optionId.match(/^write-in-(\d+)$/);

    if (!indexedWriteInMatch) {
      return [writeInCandidate];
    }

    const writeInIndex = safeParseInt(indexedWriteInMatch[1]).assertOk(
      '\\d+ ensures this is an integer'
    );

    return [
      {
        id: mark.optionId,
        name: `Write-In #${writeInIndex + 1}`,
        isWriteIn: true,
      },
    ];
  }

  const candidate = contest.candidates.find((c) => c.id === mark.optionId);
  assert(candidate, `Candidate not found: ${mark.contestId}/${mark.optionId}`);
  return [candidate];
}

function markToYesNoVotes(
  markThresholds: Pick<MarkThresholds, 'definite'>,
  mark: BallotTargetMark,
  contest: YesNoContest
): YesNoVote {
  assert(mark.type === 'yesno');
  return getMarkStatus(mark.score, markThresholds) === MarkStatus.Marked
    ? [mark.optionId === contest.yesOption.id ? 'yes' : 'no']
    : [];
}

/**
 * Convert {@link BallotTargetMark}s to {@link VotesDict}.
 */
export function convertMarksToVotesDict(
  contests: Contests,
  markThresholds: MarkThresholdsOptionalMarginal,
  marks: Iterable<BallotTargetMark>
): VotesDict {
  const votesDict: VotesDict = {};
  for (const mark of marks) {
    const contest = contests.find((c) => c.id === mark.contestId);
    assert(contest, `Contest not found: ${mark.contestId}`);
    const existingVotes = votesDict[mark.contestId] ?? [];
    const newVotes =
      contest.type === 'candidate'
        ? markToCandidateVotes(contest, markThresholds, mark)
        : contest.type === 'yesno'
        ? markToYesNoVotes(markThresholds, mark, contest)
        : /* c8 ignore next */
          throwIllegalValue(contest, 'type');

    if (newVotes.length > 0) {
      votesDict[mark.contestId] = [...existingVotes, ...newVotes] as Vote;
    }
  }
  return votesDict;
}
