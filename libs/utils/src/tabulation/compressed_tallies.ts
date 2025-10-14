import {
  AnyContest,
  CandidateContestCompressedTally,
  CandidateContestCompressedTallySchema,
  CompressedTally,
  CompressedTallyEntry,
  ContestId,
  Election,
  PrecinctSelection,
  Tabulation,
  unsafeParse,
  YesNoContestCompressedTally,
  YesNoContestCompressedTallySchema,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { assert, throwIllegalValue, typedAs } from '@votingworks/basics';
import { ContestResults } from '@votingworks/types/src/tabulation';
import { getContestsForPrecinctAndElection } from './contest_filtering';

const MAX_UINT16 = 0xffff;

// TODO(CARO) Set to 1 for first stable version after initial VxQR development is complete.
const COMPRESSED_TALLY_VERSION = 0; // Increment this if the format changes and make sure the reading code can handle multiple versions.

export function encodeCompressedTally(
  compressedTally: CompressedTally,
  numParts: number
): string[] {
  const flatArray = [COMPRESSED_TALLY_VERSION, ...compressedTally.flat()];
  for (const value of flatArray) {
    assert(
      Number.isInteger(value) && value >= 0 && value <= MAX_UINT16,
      `Value ${value} is too large to be encoded in compressed tally`
    );
  }
  const uint16Array = new Uint16Array(flatArray);
  const sectionSize = Math.ceil(uint16Array.length / numParts);
  const sections: string[] = [];
  for (let i = 0; i < numParts; i += 1) {
    const start = i * sectionSize;
    const end = Math.min(start + sectionSize, uint16Array.length);
    const section = uint16Array.slice(start, end);
    sections.push(
      Buffer.from(
        section.buffer,
        section.byteOffset,
        section.byteLength
      ).toString('base64url')
    );
  }
  return sections;
}

/**
 * Compresses election results
 */
export function compressTally(
  election: Election,
  results: Tabulation.ElectionResults,
  precinctSelection: PrecinctSelection
): CompressedTally {
  const contests = getContestsForPrecinctAndElection(
    election,
    precinctSelection
  );
  // eslint-disable-next-line array-callback-return
  return contests.map((contest) => {
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
}

/**
 * Compresses and encodes election results
 */
export function compressAndEncodeTally({
  election,
  results,
  precinctSelection,
  numParts: numSections,
}: {
  election: Election;
  results: Tabulation.ElectionResults;
  precinctSelection: PrecinctSelection;
  numParts: number;
}): string[] {
  const compressedTally = compressTally(election, results, precinctSelection);
  return encodeCompressedTally(compressedTally, numSections);
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

// The length of a yes/no contest compressed tally is always 5: undervotes, overvotes, ballots, yes, no
const yesNoContestCompressedTallyLength: YesNoContestCompressedTally['length'] = 5;

function getNumberOfEntriesInContest(contest: AnyContest): number {
  switch (contest.type) {
    case 'yesno':
      return yesNoContestCompressedTallyLength;
    case 'candidate':
      return (
        1 /* number of ballots */ +
        1 /* overvotes */ +
        1 /* undervotes */ +
        contest.candidates.length +
        (contest.allowWriteIns ? 1 : 0)
      );
    /* istanbul ignore next */
    default:
      throwIllegalValue(contest, 'type');
  }
}

export function decodeCompressedTally(
  encodedCompressedTally: string,
  precinctSelection: PrecinctSelection,
  election: Election
): CompressedTally {
  const buffer = Buffer.from(encodedCompressedTally, 'base64url');
  const uint16Array = new Uint16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Uint16Array.BYTES_PER_ELEMENT
  );
  const compressedTally: CompressedTally = [];
  const encodedVersion = uint16Array[0];
  // Currently we only support one version, so this is just a check that the version is correct. As breaking changes occur after
  // initial VxQR development is complete, this function will need to handle reading multiple versions for backwards compatibility.
  assert(
    encodedVersion === COMPRESSED_TALLY_VERSION,
    `Unsupported compressed tally version ${encodedVersion}`
  );
  let offset = 1;
  const contests = getContestsForPrecinctAndElection(
    election,
    precinctSelection
  );
  const totalNumberOfEntries = contests.reduce(
    (sum, contest) => sum + getNumberOfEntriesInContest(contest),
    0
  );
  assert(
    uint16Array.length === 1 /* version number */ + totalNumberOfEntries,
    `Expected compressed tally to have ${totalNumberOfEntries} entries, got ${uint16Array.length}`
  );
  for (const contest of contests) {
    const tallyLength = getNumberOfEntriesInContest(contest);
    if (contest.type === 'yesno') {
      compressedTally.push(
        Array.from(
          uint16Array.slice(offset, offset + tallyLength)
        ) as YesNoContestCompressedTally
      );
      offset += tallyLength;
    } else if (contest.type === 'candidate') {
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
export function decodeAndReadCompressedTally({
  election,
  precinctSelection,
  encodedTally,
}: {
  election: Election;
  precinctSelection: PrecinctSelection;
  encodedTally: string;
}): Record<ContestId, ContestResults> {
  const compressedTally = decodeCompressedTally(
    encodedTally,
    precinctSelection,
    election
  );
  const contests = getContestsForPrecinctAndElection(
    election,
    precinctSelection
  );
  const allContestResults: Tabulation.ElectionResults['contestResults'] = {};
  for (const [contestIdx, contest] of contests.entries()) {
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
