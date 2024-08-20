import {
  BallotId,
  BallotIdSchema,
  BallotStyleId,
  BallotType,
  BallotTypeMaximumValue,
  Candidate,
  CandidateVote,
  CompletedBallot,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
  HmpbBallotPageMetadata,
  isVotePresent,
  PrecinctId,
  unsafeParse,
  validateVotes,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types';
import { assert, iter } from '@votingworks/basics';
import { BitReader, BitWriter, CustomEncoding, Uint8, Uint8Size } from './bits';

/**
 * Maximum number of characters in a write-in.
 */
export const MAXIMUM_WRITE_IN_LENGTH = 40;

/**
 * Exact length of the ballot hash used in the ballot encoding.
 */
export const BALLOT_HASH_ENCODING_LENGTH = 20;

/**
 * Maximum number of pages in a hand-marked paper ballot.
 */
export const MAXIMUM_PAGE_NUMBERS = 30;

/**
 * Maximum number of precincts in an election that we can encode in 12 bits.
 */
export const MAXIMUM_PRECINCTS = 4096;

/**
 * Maximum number of ballot styles in an election that we can encode in 12 bits.
 */
export const MAXIMUM_BALLOT_STYLES = 4096;

/**
 * Slices a ballot hash down to the length used in ballot encoding. Useful
 * to have this as a utility function so it can be mocked in other modules' tests.
 */
export function sliceBallotHashForEncoding(ballotHash: string): string {
  return ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH);
}

// TODO: include "magic number" and encoding version

/**
 * Encoding for write-ins, defines the characters allowed in a write-in. Should
 * match the values present on BMD's `{@link VirtualKeyboard}`.
 */
export const WriteInEncoding = new CustomEncoding(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ \'"-.,'
);

/**
 * Encoding for hexadecimal string values, e.g. the ballot hash.
 */
export const HexEncoding = new CustomEncoding('0123456789abcdef');

/**
 * The bytes we expect a BMD ballot to start with.
 */
export const BmdPrelude: readonly Uint8[] = [
  /* V */ 86, /* X */ 88, /* version = */ 2,
];

/**
 * The bytes we expect a hand-marked paper ballot to start with.
 */
export const HmpbPrelude: readonly Uint8[] = [
  /* V */ 86, /* P = Paper */ 80, /* version = */ 2,
];

/**
 * Detect whether `data` is a votingworks encoded ballot / metadata.
 */
export function isVxBallot(data: Uint8Array): boolean {
  const prelude = data.slice(0, BmdPrelude.length);
  return (
    prelude.length === BmdPrelude.length &&
    prelude.every((byte, i) => byte === BmdPrelude[i])
  );
}

/**
 * Data needed to uniquely identify a ballot page, possibly including an ID.
 */
export interface BallotConfig {
  ballotId?: BallotId;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  isTestMode: boolean;
  precinctId: PrecinctId;
  pageNumber?: number; // For HMPB only
}

/**
 * Encodes a {@link BallotConfig} into the given bit writer.
 */
export function encodeBallotConfigInto(
  election: Election,
  {
    ballotId,
    ballotStyleId,
    ballotType,
    isTestMode,
    precinctId,
    pageNumber,
  }: BallotConfig,
  bits: BitWriter
): BitWriter {
  const { precincts, ballotStyles } = election;
  const precinctIndex = precincts.findIndex((p) => p.id === precinctId);
  const ballotStyleIndex = ballotStyles.findIndex(
    (bs) => bs.id === ballotStyleId
  );

  if (precinctIndex === -1) {
    throw new Error(`precinct ID not found: ${precinctId}`);
  }

  if (ballotStyleIndex === -1) {
    throw new Error(`ballot style ID not found: ${ballotStyleId}`);
  }

  bits
    .writeUint(precinctIndex, { max: MAXIMUM_PRECINCTS })
    .writeUint(ballotStyleIndex, { max: MAXIMUM_BALLOT_STYLES });

  if (pageNumber !== undefined) {
    bits.writeUint(pageNumber, { max: MAXIMUM_PAGE_NUMBERS });
  }

  bits.writeBoolean(isTestMode);

  const ballotTypeIndex = Object.values(BallotType).indexOf(ballotType);
  bits.writeUint(ballotTypeIndex, { max: BallotTypeMaximumValue });

  bits.writeBoolean(!!ballotId);

  if (ballotId) {
    bits.writeString(ballotId);
  }

  return bits;
}

/**
 * Decodes a {@link BallotConfig} from a bit reader.
 */
export function decodeBallotConfigFromReader(
  election: Election,
  bits: BitReader,
  { readPageNumber = false }: { readPageNumber?: boolean } = {}
): BallotConfig {
  const { precincts, ballotStyles } = election;

  const precinctIndex = bits.readUint({ max: MAXIMUM_PRECINCTS });
  const ballotStyleIndex = bits.readUint({ max: MAXIMUM_BALLOT_STYLES });

  const pageNumber = readPageNumber
    ? bits.readUint({ max: MAXIMUM_PAGE_NUMBERS })
    : undefined;

  const isTestMode = bits.readBoolean();

  const ballotTypeIndex = bits.readUint({ max: BallotTypeMaximumValue });
  const ballotType = Object.values(BallotType)[ballotTypeIndex];
  assert(ballotType, `ballot type index ${ballotTypeIndex} is invalid`);

  const ballotId = bits.readBoolean()
    ? unsafeParse(BallotIdSchema, bits.readString())
    : undefined;

  const ballotStyle = ballotStyles[ballotStyleIndex];
  const precinct = precincts[precinctIndex];

  assert(ballotStyle, `ballot style index ${ballotStyleIndex} is invalid`);
  assert(precinct, `precinct index ${precinctIndex} is invalid`);

  return {
    ballotId,
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    pageNumber,
    isTestMode,
    ballotType,
  };
}

function writeYesNoVote(
  bits: BitWriter,
  ynVote: YesNoVote,
  contest: YesNoContest
): void {
  if (!Array.isArray(ynVote)) {
    throw new Error(
      `cannot encode a non-array yes/no vote: ${JSON.stringify(ynVote)}`
    );
  }

  if (ynVote.length > 1) {
    throw new Error(
      `cannot encode a yes/no overvote: ${JSON.stringify(ynVote)}`
    );
  }

  // yesno votes get a single bit
  bits.writeBoolean(ynVote[0] === contest.yesOption.id);
}

function encodeBallotVotesInto(
  contests: Contests,
  votes: VotesDict,
  bits: BitWriter
): BitWriter {
  // write roll call
  for (const contest of contests) {
    bits.writeBoolean(isVotePresent(votes[contest.id]));
  }

  // write vote data
  for (const contest of contests) {
    const contestVote = votes[contest.id];

    if (isVotePresent(contestVote)) {
      if (contest.type === 'yesno') {
        const ynVote = contestVote as YesNoVote;

        writeYesNoVote(bits, ynVote, contest);
      } else {
        const choices = contestVote as CandidateVote;

        // candidate choices get one bit per candidate
        for (const candidate of contest.candidates) {
          bits.writeBoolean(
            choices.some((choice) => choice.id === candidate.id)
          );
        }

        if (contest.allowWriteIns) {
          // write write-in data
          const writeInCount = iter(choices)
            .filter((choice) => choice.isWriteIn)
            .count();
          const nonWriteInCount = choices.length - writeInCount;
          const maximumWriteIns = Math.max(0, contest.seats - nonWriteInCount);

          if (maximumWriteIns > 0) {
            bits.writeUint(writeInCount, { max: maximumWriteIns });

            for (const choice of choices) {
              if (choice.isWriteIn) {
                bits.writeString(choice.name, {
                  encoding: WriteInEncoding,
                  maxLength: MAXIMUM_WRITE_IN_LENGTH,
                });
              }
            }
          }
        }
      }
    }
  }

  return bits;
}

/**
 * Encodes a completed ballot, including metadata and votes, into a bit writer.
 */
export function encodeBallotInto(
  election: Election,
  {
    ballotHash,
    ballotStyleId,
    precinctId,
    votes,
    ballotId,
    isTestMode,
    ballotType,
  }: CompletedBallot,
  bits: BitWriter
): BitWriter {
  const ballotStyle = getBallotStyle({ election, ballotStyleId });

  if (!ballotStyle) {
    throw new Error(`unknown ballot style id: ${ballotStyleId}`);
  }

  validateVotes({ election, ballotStyle, votes });

  const contests = getContests({ ballotStyle, election });

  return bits
    .writeUint8(...BmdPrelude)
    .writeString(sliceBallotHashForEncoding(ballotHash), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    .with(() =>
      encodeBallotConfigInto(
        election,
        {
          ballotId,
          ballotStyleId,
          precinctId,
          ballotType,
          isTestMode,
        },
        bits
      )
    )
    .with(() => encodeBallotVotesInto(contests, votes, bits));
}

/**
 * Encodes a completed ballot, including metadata and votes, as a byte array.
 */
export function encodeBallot(
  election: Election,
  ballot: CompletedBallot
): Uint8Array {
  const bits = new BitWriter();
  encodeBallotInto(election, ballot, bits);
  return bits.toUint8Array();
}

function readPaddingToEnd(bits: BitReader): void {
  let padding = 0;

  while (bits.canRead()) {
    if (bits.readUint1() !== 0) {
      throw new Error(
        'unexpected data found while reading padding, expected EOF'
      );
    }

    padding += 1;
  }

  if (padding >= Uint8Size) {
    throw new Error(
      'unexpected data found while reading padding, expected EOF'
    );
  }
}

function decodeBallotVotes(contests: Contests, bits: BitReader): VotesDict {
  const votes: VotesDict = {};

  for (const contest of contests) {
    votes[contest.id] = [];
  }

  // read roll call
  const contestsWithAnswers = contests.flatMap((contest) => {
    if (bits.readBoolean()) {
      return [contest];
    }

    return [];
  });

  // read vote data
  for (const contest of contestsWithAnswers) {
    if (contest.type === 'yesno') {
      // yesno votes get a single bit
      votes[contest.id] = bits.readBoolean()
        ? [contest.yesOption.id]
        : [contest.noOption.id];
    } else {
      const contestVote: Candidate[] = [];

      // candidate choices get one bit per candidate
      for (const candidate of contest.candidates) {
        if (bits.readBoolean()) {
          contestVote.push(candidate);
        }
      }

      if (contest.allowWriteIns) {
        // read write-in data
        const maximumWriteIns = Math.max(0, contest.seats - contestVote.length);

        if (maximumWriteIns > 0) {
          const writeInCount = bits.readUint({ max: maximumWriteIns });

          for (let i = 0; i < writeInCount; i += 1) {
            const name = bits.readString({
              encoding: WriteInEncoding,
              maxLength: MAXIMUM_WRITE_IN_LENGTH,
            });

            contestVote.push({
              id: `write-in-${name}`,
              name,
              isWriteIn: true,
            });
          }
        }
      }

      votes[contest.id] = contestVote;
    }
  }

  return votes;
}

/**
 * Decodes a completed ballot, including metadata and votes, from a bit reader.
 */
export function decodeBallotFromReader(
  election: Election,
  bits: BitReader
): CompletedBallot {
  if (!bits.skipUint8(...BmdPrelude)) {
    throw new Error(
      "expected leading prelude 'V' 'X' 0b00000002 but it was not found"
    );
  }

  const ballotHash = bits.readString({
    encoding: HexEncoding,
    length: BALLOT_HASH_ENCODING_LENGTH,
  });

  const { ballotId, ballotStyleId, ballotType, isTestMode, precinctId } =
    decodeBallotConfigFromReader(election, bits);
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  const precinct = getPrecinctById({ precinctId, election });

  assert(ballotStyle, `invalid ballot style id: ${ballotStyleId}`);
  assert(precinct, `invalid precinct id: ${precinctId}`);

  const contests = getContests({ ballotStyle, election });
  const votes = decodeBallotVotes(contests, bits);

  readPaddingToEnd(bits);

  return {
    ballotHash,
    ballotId,
    ballotStyleId,
    precinctId,
    votes,
    isTestMode,
    ballotType,
  };
}

/**
 * Decodes a completed ballot, including metadata and votes, from a byte array.
 */
export function decodeBallot(
  election: Election,
  data: Uint8Array
): CompletedBallot {
  return decodeBallotFromReader(election, new BitReader(data));
}

/**
 * Reads the ballot hash from an encoded BMD ballot metadata.
 */
export function decodeBallotHashFromReader(
  bits: BitReader
): string | undefined {
  if (bits.skipUint8(...BmdPrelude) || bits.skipUint8(...HmpbPrelude)) {
    return bits.readString({
      encoding: HexEncoding,
      length: BALLOT_HASH_ENCODING_LENGTH,
    });
  }
}

/**
 * Reads the ballot hash from an encoded ballot metadata.
 */
export function decodeBallotHash(data: Uint8Array): string | undefined {
  return decodeBallotHashFromReader(new BitReader(data));
}

/**
 * Encodes a hand-marked paper ballot's metadata into a bit writer.
 */
export function encodeHmpbBallotPageMetadataInto(
  election: Election,
  {
    ballotId,
    ballotStyleId,
    ballotType,
    ballotHash,
    isTestMode,
    pageNumber,
    precinctId,
  }: HmpbBallotPageMetadata,
  bits: BitWriter
): BitWriter {
  return bits
    .writeUint8(...HmpbPrelude)
    .writeString(sliceBallotHashForEncoding(ballotHash), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    .with(() =>
      encodeBallotConfigInto(
        election,
        {
          ballotId,
          ballotStyleId,
          ballotType,
          isTestMode,
          pageNumber,
          precinctId,
        },
        bits
      )
    );
}

/**
 * Encodes hand-marked paper ballot page metadata as a byte array.
 */
export function encodeHmpbBallotPageMetadata(
  election: Election,
  metadata: HmpbBallotPageMetadata
): Uint8Array {
  return encodeHmpbBallotPageMetadataInto(
    election,
    metadata,
    new BitWriter()
  ).toUint8Array();
}
