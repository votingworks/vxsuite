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
import { Buffer } from 'node:buffer';
import { assert, throwIllegalValue, typedAs } from '@votingworks/basics';

/**
 * Compresses election results
 */
export function compressTally(
  election: Election,
  results: Tabulation.ElectionResults
): string {
  // eslint-disable-next-line array-callback-return
  const compressedTally = election.contests.map((contest) => {
    switch (contest.type) {
      case 'yesno': {
        const contestResults = results.contestResults[contest.id];
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
        const contestResults = results.contestResults[contest.id];
        assert(contestResults?.contestType === 'candidate');
        return typedAs<CandidateContestCompressedTally>([
          contestResults?.undervotes ?? 0, // undervotes
          contestResults?.overvotes ?? 0, // overvotes
          contestResults?.ballots ?? 0, // ballotsCast
          ...contest.candidates.map(
            (candidate) => contestResults?.tallies[candidate.id]?.tally ?? 0
          ),
          contestResults?.tallies[Tabulation.GENERIC_WRITE_IN_ID]?.tally ?? 0, // writeIns
        ]);
      }

      /* istanbul ignore next */
      default:
        throwIllegalValue(contest, 'type');
    }
  });
  const flatArray = compressedTally.flat();
  const uint16Array = new Uint16Array(flatArray);
  return Buffer.from(uint16Array.buffer).toString('base64url');
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
        {};
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
        candidateTallies[candidate.id] = {
          ...candidate,
          tally,
        };
      }
      if (contest.allowWriteIns) {
        // write ins will be the last thing in the array after the metadata (3 items) and all candidates
        const writeInTally = tallyByCandidate.pop();
        assert(writeInTally !== undefined);
        candidateTallies[Tabulation.GENERIC_WRITE_IN_ID] = {
          ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
          tally: writeInTally,
        };
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
    /* istanbul ignore next */
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
  serializedTally: string,
  cardCounts: Tabulation.CardCounts
): Tabulation.ElectionResults {
  const buffer = Buffer.from(serializedTally, 'base64url');
  const uint16Array = new Uint16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 2
  );
  const compressedTally: CompressedTally = [];
  let offset = 0;
  for (const contest of election.contests) {
    if (contest.type === 'yesno') {
      compressedTally.push(
        uint16Array.slice(
          offset,
          offset + 5
        ) as unknown as YesNoContestCompressedTally
      );
      offset += 5;
    } else if (contest.type === 'candidate') {
      const numCandidates = contest.candidates.length;
      const tallyLength = numCandidates + 4; // 3 metadata + candidates + write-in
      compressedTally.push(
        uint16Array.slice(
          offset,
          offset + tallyLength
        ) as unknown as CandidateContestCompressedTally
      );
      offset += tallyLength;
    } else {
      throwIllegalValue(contest, 'type');
    }
  }
  const allContestResults: Tabulation.ElectionResults['contestResults'] = {};
  for (const [contestIdx, contest] of election.contests.entries()) {
    const serializedContestTally = compressedTally[contestIdx];
    assert(serializedContestTally);
    const contestResults = getContestTalliesForCompressedContest(
      contest,
      serializedContestTally
    );
    allContestResults[contest.id] = contestResults;
  }

  return {
    cardCounts,
    contestResults: allContestResults,
  };
}
