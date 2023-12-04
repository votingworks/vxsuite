import {
  AnyContest,
  CandidateContestCompressedTally,
  CandidateContestCompressedTallySchema,
  CompressedTally,
  CompressedTallyEntry,
  Election,
  Tabulation,
  unsafeParse,
  YesNoContestCompressedTally,
  YesNoContestCompressedTallySchema,
} from '@votingworks/types';
import { assert, throwIllegalValue, typedAs } from '@votingworks/basics';

/**
 * Compresses election results
 */
export function compressTally(
  election: Election,
  results: Tabulation.ElectionResults
): CompressedTally {
  // eslint-disable-next-line array-callback-return
  return election.contests.map((contest) => {
    switch (contest.type) {
      case 'yesno': {
        const contestResults = results.contestResults.get(contest.id);
        assert(contestResults?.contestType === 'yesno');
        return typedAs<YesNoContestCompressedTally>([
          contestResults?.undervotes ?? 0, // undervotes
          contestResults?.overvotes ?? 0, // overvotes
          contestResults?.ballots ?? 0, // ballots cast
          contestResults?.yesTally ?? 0, // yes
          contestResults?.noTally ?? 0, // no
        ]);
      }

      case 'candidate': {
        const contestResults = results.contestResults.get(contest.id);
        assert(contestResults?.contestType === 'candidate');
        return typedAs<CandidateContestCompressedTally>([
          contestResults?.undervotes ?? 0, // undervotes
          contestResults?.overvotes ?? 0, // overvotes
          contestResults?.ballots ?? 0, // ballotsCast
          ...contest.candidates.map(
            (candidate) => contestResults?.tallies.get(candidate.id)?.tally ?? 0
          ),
          contestResults?.tallies.get(Tabulation.GENERIC_WRITE_IN_ID)?.tally ??
            0, // writeIns
        ]);
      }

      /* c8 ignore next 2 */
      default:
        throwIllegalValue(contest, 'type');
    }
  });
}

function getContestTalliesForCompressedContest(
  contest: AnyContest,
  compressedContest: CompressedTallyEntry
): Tabulation.ContestResults {
  switch (contest.type) {
    case 'yesno': {
      const [undervotes, overvotes, ballots, yesTally, noTally] = unsafeParse(
        YesNoContestCompressedTallySchema,
        compressedContest
      );
      return {
        contestId: contest.id,
        contestType: 'yesno',
        yesOptionId: contest.yesOption.id,
        noOptionId: contest.noOption.id,
        ballots,
        undervotes,
        overvotes,
        yesTally,
        noTally,
      };
    }
    case 'candidate': {
      const [undervotes, overvotes, ballots, ...tallyByCandidate] = unsafeParse(
        CandidateContestCompressedTallySchema,
        compressedContest
      );
      const candidateTallies: Tabulation.CandidateContestResults['tallies'] =
        new Map();
      for (const [candidateIdx, candidate] of contest.candidates.entries()) {
        const tally = tallyByCandidate[candidateIdx];
        assert(
          tally !== undefined,
          `tally for contest '${
            contest.id
          }' by candidate missing value at index ${candidateIdx}: ${JSON.stringify(
            tallyByCandidate
          )} (full tally: ${JSON.stringify(compressedContest)})`
        );
        candidateTallies.set(candidate.id, {
          ...candidate,
          tally,
        });
      }
      if (contest.allowWriteIns) {
        // write ins will be the last thing in the array after the metadata (3 items) and all candidates
        const writeInTally = tallyByCandidate.pop();
        assert(writeInTally !== undefined);
        candidateTallies.set(Tabulation.GENERIC_WRITE_IN_ID, {
          ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
          tally: writeInTally,
        });
      }
      return {
        contestId: contest.id,
        contestType: 'candidate',
        votesAllowed: contest.seats,
        undervotes,
        overvotes,
        ballots,
        tallies: candidateTallies,
      };
    }
    /* c8 ignore next 2 */
    default:
      throwIllegalValue(contest, 'type');
  }
}

/**
 * Creates a tally from a serialized tally read from a smart card. If a
 * `partyId` is provided, only includes contests associated with that party.
 * If `partyId` is undefined, only includes nonpartisan races.
 */
export function readCompressedTally(
  election: Election,
  serializedTally: CompressedTally,
  cardCounts: Tabulation.CardCounts
): Tabulation.ElectionResults {
  const allContestResults: Tabulation.ElectionResults['contestResults'] =
    new Map();
  for (const [contestIdx, contest] of election.contests.entries()) {
    const serializedContestTally = serializedTally[contestIdx];
    assert(serializedContestTally);
    const contestResults = getContestTalliesForCompressedContest(
      contest,
      serializedContestTally
    );
    allContestResults.set(contest.id, contestResults);
  }

  return {
    cardCounts,
    contestResults: allContestResults,
  };
}
