import {
  AnyContest,
  CandidateContestCompressedTally,
  CandidateContestCompressedTallySchema,
  CompressedTally,
  CompressedTallyEntry,
  ContestId,
  Election,
  PrecinctId,
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
import { singlePrecinctSelectionFor } from '../precinct_selection';

const MAX_UINT16 = 0xffff;

const COMPRESSED_TALLY_V0 = 0;

function encodeUint16ArrayToPages(
  flatArray: number[],
  numPages: number
): string[] {
  for (const value of flatArray) {
    assert(
      Number.isInteger(value) && value >= 0 && value <= MAX_UINT16,
      `Value ${value} is too large to be encoded in compressed tally`
    );
  }
  const uint16Array = new Uint16Array(flatArray);
  const sectionSize = Math.ceil(uint16Array.length / numPages);
  const sections: string[] = [];
  for (let i = 0; i < numPages; i += 1) {
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

export function encodeCompressedTally(
  compressedTally: CompressedTally,
  numPages: number
): string[] {
  const flatArray = [COMPRESSED_TALLY_V0, ...compressedTally.flat()];
  return encodeUint16ArrayToPages(flatArray, numPages);
}

/**
 * Compresses election results for a given set of contests determined by
 * precinctSelection.
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
 * Builds a bitmap of uint16 words indicating which precincts have data.
 * Bit i (in word floor(i/16), bit position i%16) is set when
 * election.precincts[i].id exists in the resultsByPrecinct keys.
 */
function buildPrecinctBitmap(
  election: Election,
  resultsByPrecinct: Partial<Record<PrecinctId, Tabulation.ElectionResults>>
): Uint16Array {
  const numWords = Math.ceil(election.precincts.length / 16);
  const bitmap = new Uint16Array(numWords); // initialized to 0
  for (const [i, precinct] of election.precincts.entries()) {
    if (resultsByPrecinct[precinct.id] !== undefined) {
      const wordIndex = Math.floor(i / 16);
      const bitIndex = i % 16;
      // eslint-disable-next-line no-bitwise
      bitmap[wordIndex] = (bitmap[wordIndex] ?? 0) | (1 << bitIndex);
    }
  }
  return bitmap;
}

/**
 * Reads a precinct bitmap from a uint16 array at the given offset.
 * Returns a boolean array indexed by precinct position.
 */
function readPrecinctBitmap(
  uint16Array: Uint16Array,
  offset: number,
  numPrecincts: number
): { bitmap: boolean[]; nextOffset: number } {
  const numWords = Math.ceil(numPrecincts / 16);
  const bitmap: boolean[] = [];
  for (let i = 0; i < numPrecincts; i += 1) {
    const wordIndex = Math.floor(i / 16);
    const bitIndex = i % 16;
    const word = uint16Array[offset + wordIndex];
    assert(word !== undefined, 'Bitmap data truncated');
    // eslint-disable-next-line no-bitwise
    bitmap.push(((word >> bitIndex) & 1) === 1);
  }
  return { bitmap, nextOffset: offset + numWords };
}

/**
 * Decodes a base64url-encoded precinct bitmap and returns the precinct IDs
 * that have data according to the bitmap.
 */
export function getPrecinctIdsFromBitmap(
  election: Election,
  encodedBitmap: string
): PrecinctId[] {
  const bitmapBuffer = Buffer.from(encodedBitmap, 'base64url');
  const bitmapUint16 = new Uint16Array(
    bitmapBuffer.buffer,
    bitmapBuffer.byteOffset,
    bitmapBuffer.byteLength / Uint16Array.BYTES_PER_ELEMENT
  );
  const { bitmap } = readPrecinctBitmap(
    bitmapUint16,
    0,
    election.precincts.length
  );
  return election.precincts.filter((_p, i) => bitmap[i]).map((p) => p.id);
}

/**
 * Compresses and encodes per-precinct election results using the bitmap
 * format. The bitmap flags which precincts have data; only those precincts'
 * contest entries are included. No version byte is emitted — the QR message
 * format version (qr2) implies this encoding.
 */
export function compressAndEncodeTally({
  election,
  resultsByPrecinct,
  numPages,
}: {
  election: Election;
  resultsByPrecinct: Partial<Record<PrecinctId, Tabulation.ElectionResults>>;
  numPages: number;
}): string[] {
  const bitmap = buildPrecinctBitmap(election, resultsByPrecinct);
  const tallyEntries: number[] = [];

  for (const precinct of election.precincts) {
    const precinctResults = resultsByPrecinct[precinct.id];
    if (precinctResults) {
      const precinctSelection = singlePrecinctSelectionFor(precinct.id);
      const compressedTally = compressTally(
        election,
        precinctResults,
        precinctSelection
      );
      tallyEntries.push(...compressedTally.flat());
    }
  }

  return encodeUint16ArrayToPages([...bitmap, ...tallyEntries], numPages);
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
  assert(
    encodedVersion === COMPRESSED_TALLY_V0,
    `Unsupported compressed tally version ${encodedVersion} for V0 decode`
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
 * Encodes the precinct bitmap as a standalone base64url string.
 */
export function encodePrecinctBitmap(
  election: Election,
  resultsByPrecinct: Partial<Record<PrecinctId, Tabulation.ElectionResults>>
): string {
  const bitmap = buildPrecinctBitmap(election, resultsByPrecinct);
  return Buffer.from(
    bitmap.buffer,
    bitmap.byteOffset,
    bitmap.byteLength
  ).toString('base64url');
}

/**
 * Encodes per-precinct contest entries WITHOUT the bitmap prefix.
 * The result is one or more base64url strings (pages) containing only
 * the tally data for precincts that have results.
 */
export function encodeTallyEntries({
  election,
  resultsByPrecinct,
  numPages,
}: {
  election: Election;
  resultsByPrecinct: Partial<Record<PrecinctId, Tabulation.ElectionResults>>;
  numPages: number;
}): string[] {
  const tallyEntries: number[] = [];

  for (const precinct of election.precincts) {
    const precinctResults = resultsByPrecinct[precinct.id];
    if (precinctResults) {
      const precinctSelection = singlePrecinctSelectionFor(precinct.id);
      const compressedTally = compressTally(
        election,
        precinctResults,
        precinctSelection
      );
      tallyEntries.push(...compressedTally.flat());
    }
  }

  return encodeUint16ArrayToPages(tallyEntries, numPages);
}

/**
 * Splits encoded tally entries into per-precinct v0-format encoded tallies.
 * The precinctIds must be in election.precincts order (as returned by
 * {@link getPrecinctIdsFromBitmap}).
 */
export function splitEncodedTallyByPrecinct(
  election: Election,
  precinctIds: PrecinctId[],
  encodedTallyEntries: string
): Array<{ precinctId: PrecinctId; encodedTally: string }> {
  const tallyBuffer = Buffer.from(encodedTallyEntries, 'base64url');
  const tallyUint16 = new Uint16Array(
    tallyBuffer.buffer,
    tallyBuffer.byteOffset,
    tallyBuffer.byteLength / Uint16Array.BYTES_PER_ELEMENT
  );

  const results: Array<{ precinctId: PrecinctId; encodedTally: string }> = [];
  let offset = 0;

  for (const precinctId of precinctIds) {
    const precinctSelection = singlePrecinctSelectionFor(precinctId);
    const contests = getContestsForPrecinctAndElection(
      election,
      precinctSelection
    );
    const precinctTallySize = contests.reduce(
      (sum, contest) => sum + getNumberOfEntriesInContest(contest),
      0
    );
    const slice = tallyUint16.slice(offset, offset + precinctTallySize);
    offset += precinctTallySize;

    const v0Array = [COMPRESSED_TALLY_V0, ...Array.from(slice)];
    const encodedTally = encodeUint16ArrayToPages(v0Array, 1)[0];
    assert(encodedTally !== undefined);
    results.push({ precinctId, encodedTally });
  }

  assert(
    offset === tallyUint16.length,
    `Expected to consume all tally data, but ${
      tallyUint16.length - offset
    } entries remain`
  );

  return results;
}

/**
 * Decodes contest entries from a uint16 array for a given set of contests,
 * starting at the given offset. Returns contest results and the next offset.
 */
function decodeContestEntriesFromUint16Array(
  uint16Array: Uint16Array,
  contests: readonly AnyContest[],
  offset: number
): { contestResults: Record<ContestId, ContestResults>; nextOffset: number } {
  const contestResults: Record<ContestId, ContestResults> = {};
  let currentOffset = offset;
  for (const contest of contests) {
    const tallyLength = getNumberOfEntriesInContest(contest);
    const entryArray = Array.from(
      uint16Array.slice(currentOffset, currentOffset + tallyLength)
    );
    let compressedEntry: CompressedTallyEntry;
    if (contest.type === 'yesno') {
      compressedEntry = entryArray as YesNoContestCompressedTally;
    } else {
      compressedEntry = entryArray as CandidateContestCompressedTally;
    }
    contestResults[contest.id] = getContestTalliesForCompressedContest(
      contest,
      compressedEntry
    );
    currentOffset += tallyLength;
  }
  return { contestResults, nextOffset: currentOffset };
}

/**
 * Decodes a bitmap-format encoded tally into per-precinct contest results.
 * The bitmap starts at offset 0 (no version byte).
 */
function decodeBitmapTally(
  uint16Array: Uint16Array,
  election: Election
): Record<PrecinctId, Record<ContestId, ContestResults>> {
  const { bitmap, nextOffset: dataOffset } = readPrecinctBitmap(
    uint16Array,
    0,
    election.precincts.length
  );

  const result: Record<PrecinctId, Record<ContestId, ContestResults>> = {};
  let offset = dataOffset;

  for (const [i, precinct] of election.precincts.entries()) {
    if (bitmap[i]) {
      const precinctSelection = singlePrecinctSelectionFor(precinct.id);
      const contests = getContestsForPrecinctAndElection(
        election,
        precinctSelection
      );
      const { contestResults, nextOffset } =
        decodeContestEntriesFromUint16Array(uint16Array, contests, offset);
      result[precinct.id] = contestResults;
      offset = nextOffset;
    }
  }

  assert(
    offset === uint16Array.length,
    `Expected to consume all data, but ${
      uint16Array.length - offset
    } entries remain`
  );

  return result;
}

/**
 * Aggregates per-precinct contest results into a single set of contest results.
 * For contests that appear in multiple precincts, tallies are summed.
 */
function aggregatePerPrecinctResults(
  perPrecinctResults: Record<PrecinctId, Record<ContestId, ContestResults>>
): Record<ContestId, ContestResults> {
  const aggregated: Record<ContestId, ContestResults> = {};
  for (const precinctContestResults of Object.values(perPrecinctResults)) {
    for (const [contestId, contestResults] of Object.entries(
      precinctContestResults
    )) {
      const existing = aggregated[contestId];
      if (!existing) {
        aggregated[contestId] = structuredClone(contestResults);
        continue;
      }
      existing.ballots += contestResults.ballots;
      existing.undervotes += contestResults.undervotes;
      existing.overvotes += contestResults.overvotes;
      if (
        existing.contestType === 'yesno' &&
        contestResults.contestType === 'yesno'
      ) {
        existing.yesTally += contestResults.yesTally;
        existing.noTally += contestResults.noTally;
      } else if (
        existing.contestType === 'candidate' &&
        contestResults.contestType === 'candidate'
      ) {
        for (const [candidateId, candidateTally] of Object.entries(
          contestResults.tallies
        )) {
          const existingCandidate = existing.tallies[candidateId];
          if (existingCandidate) {
            existingCandidate.tally += candidateTally.tally;
          } else {
            existing.tallies[candidateId] = { ...candidateTally };
          }
        }
      }
    }
  }
  return aggregated;
}

function decodeEncodedTallyToUint16Array(encodedTally: string): Uint16Array {
  const buffer = Buffer.from(encodedTally, 'base64url');
  return new Uint16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Uint16Array.BYTES_PER_ELEMENT
  );
}

/**
 * Decodes an encoded compressed tally and returns aggregated contest results.
 * Auto-detects format from the first uint16: 0 → V0, non-zero → bitmap.
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
  const uint16Array = decodeEncodedTallyToUint16Array(encodedTally);

  if (uint16Array[0] === COMPRESSED_TALLY_V0) {
    const compressedTally = decodeCompressedTally(
      encodedTally,
      precinctSelection,
      election
    );
    const contests = getContestsForPrecinctAndElection(
      election,
      precinctSelection
    );
    const allContestResults: Record<ContestId, ContestResults> = {};
    for (const [contestIdx, contest] of contests.entries()) {
      const serializedContestTally = compressedTally[contestIdx];
      assert(serializedContestTally);
      allContestResults[contest.id] = getContestTalliesForCompressedContest(
        contest,
        serializedContestTally
      );
    }
    return allContestResults;
  }

  const perPrecinctResults = decodeBitmapTally(uint16Array, election);
  return aggregatePerPrecinctResults(perPrecinctResults);
}

/**
 * Decodes a bitmap-format encoded tally and returns per-precinct contest
 * results. Asserts the data is not V0 format.
 */
export function decodeAndReadPerPrecinctCompressedTally({
  election,
  encodedTally,
}: {
  election: Election;
  encodedTally: string;
}): Record<PrecinctId, Record<ContestId, ContestResults>> {
  const uint16Array = decodeEncodedTallyToUint16Array(encodedTally);
  const firstWord = uint16Array[0];
  assert(
    firstWord !== COMPRESSED_TALLY_V0,
    `Per-precinct decode requires bitmap format, got V0 legacy data`
  );
  return decodeBitmapTally(uint16Array, election);
}
