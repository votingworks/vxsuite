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
  YesNoContestOptionId,
  YesNoVote,
} from '@votingworks/types';

export function getSingleYesNoVote(
  vote?: YesNoVote
): YesNoContestOptionId | undefined {
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
): readonly YesNoContestOptionId[] {
  return [contest.yesOption.id, contest.noOption.id];
}

/**
 * Gets all the vote options a voter can make for a given candidate contest. If
 * write-ins are allowed a single write-in candidate ID is included.
 * @returns Candidate[] ex. ['aaron', 'bob', 'write-in']
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
  mark: BallotTargetMark
): YesNoVote {
  assert(mark.type === 'yesno');
  return getMarkStatus(mark.score, markThresholds) === MarkStatus.Marked
    ? [mark.optionId]
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
        ? markToYesNoVotes(markThresholds, mark)
        : /* c8 ignore next */
          throwIllegalValue(contest, 'type');

    if (newVotes.length > 0) {
      votesDict[mark.contestId] = [...existingVotes, ...newVotes] as Vote;
    }
  }
  return votesDict;
}

/**
 * Determines the number of write-in candidates in a {@link VotesDict}
 */
export function getWriteInCount(votes: VotesDict): number {
  let count = 0;
  for (const vote of Object.values(votes)) {
    if (vote) {
      for (const voteOption of vote) {
        if (typeof voteOption !== 'string' && voteOption.isWriteIn) {
          count += 1;
        }
      }
    }
  }

  return count;
}

/**
 * Determines whether a {@link VotesDict} contains any write-in candidates
 */
export function hasWriteIns(votes: VotesDict): boolean {
  for (const vote of Object.values(votes)) {
    if (vote) {
      for (const voteOption of vote) {
        if (typeof voteOption !== 'string' && voteOption.isWriteIn) {
          return true;
        }
      }
    }
  }

  return false;
}
