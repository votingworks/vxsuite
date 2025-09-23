import {
  AnyContest,
  CandidateContestCompressedTally,
  CandidateContestCompressedTallySchema,
  CompressedTally,
  CompressedTallyEntry,
  ContestId,
  Election,
  Tabulation,
  unsafeParse,
  YesNoContestCompressedTally,
  YesNoContestCompressedTallySchema,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { assert, throwIllegalValue, typedAs } from '@votingworks/basics';
import { ContestResults } from '@votingworks/types/src/tabulation';

export function encodeCompressedTally(
  compressedTally: CompressedTally
): string {
  const flatArray = compressedTally.flat();
  const uint16Array = new Uint16Array(flatArray);
  return Buffer.from(uint16Array.buffer).toString('base64url');
}

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
        assert(contestResults !== undefined);
        assert(contestResults.contestType === 'yesno');
        return typedAs<YesNoContestCompressedTally>([
          contestResults.undervotes, // undervotes
          contestResults.overvotes, // overvotes
          contestResults.ballots, // ballots cast
          contestResults.yesTally, // yes
          contestResults.noTally, // no
        ]);
      }

      case 'candidate': {
        const contestResults = results.contestResults[contest.id];
        assert(contestResults !== undefined);
        assert(contestResults.contestType === 'candidate');
        return typedAs<CandidateContestCompressedTally>([
          contestResults.undervotes, // undervotes
          contestResults.overvotes, // overvotes
          contestResults.ballots, // ballotsCast
          ...contest.candidates.map(
            (candidate) => contestResults.tallies[candidate.id]?.tally ?? 0
          ),
          ...(contest.allowWriteIns
            ? [
                contestResults.tallies[Tabulation.GENERIC_WRITE_IN_ID]?.tally ??
                  0,
              ]
            : []),
        ]);
      }

      /* istanbul ignore next - @preserve */
      default:
        throwIllegalValue(contest, 'type');
    }
  });
  return encodeCompressedTally(compressedTally);
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
          id: candidate.id,
          name: candidate.name,
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

export function decodeCompressedTally(
  encodedCompressedTally: string,
  election: Election
): CompressedTally {
  const buffer = Buffer.from(encodedCompressedTally, 'base64url');
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
        Array.from(
          uint16Array.slice(offset, offset + 5)
        ) as YesNoContestCompressedTally
      );
      offset += 5;
    } else if (contest.type === 'candidate') {
      const numCandidates = contest.candidates.length;
      const tallyLength = 3 + numCandidates + (contest.allowWriteIns ? 1 : 0); // 3 metadata + candidates + write-in
      compressedTally.push(
        Array.from(
          uint16Array.slice(offset, offset + tallyLength)
        ) as CandidateContestCompressedTally
      );
      offset += tallyLength;
    } else {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(contest, 'type');
    }
  }
  return compressedTally;
}

/**
 * Creates a tally from a serialized tally read from a smart card. If a
 * `partyId` is provided, only includes contests associated with that party.
 * If `partyId` is undefined, only includes nonpartisan races.
 */
export function readCompressedTally(
  election: Election,
  serializedTally: string
): Record<ContestId, ContestResults> {
  const compressedTally = decodeCompressedTally(serializedTally, election);
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

  return allContestResults;
}
