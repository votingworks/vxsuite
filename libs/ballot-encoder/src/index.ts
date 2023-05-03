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
  isVotePresent,
  PrecinctId,
  unsafeParse,
  validateVotes,
  VotesDict,
  YesNoVote,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  BitReader,
  BitWriter,
  CustomEncoding,
  toUint8,
  Uint8,
  Uint8Size,
} from './bits';

/**
 * Maximum number of characters in a write-in.
 */
export const MAXIMUM_WRITE_IN_LENGTH = 40;

/**
 * Exact length of the SHA256 hash of the election definition.
 */
export const ELECTION_HASH_LENGTH = 20;

/**
 * Slices an election hash down to the length used in ballot encoding. Useful
 * to have this as a utility function so it can be mocked in other modules' tests.
 */
export function sliceElectionHash(electionHash: string): string {
  return electionHash.slice(0, ELECTION_HASH_LENGTH);
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
 * Encoding for hexadecimal string values, e.g. the election hash.
 */
export const HexEncoding = new CustomEncoding('0123456789abcdef');

/**
 * The bytes we expect a BMD ballot to start with.
 */
export const Prelude: readonly Uint8[] = [
  /* V */ 86, /* X */ 88, /* version = */ 2,
];

/**
 * Detects whether `data` is a v1-encoded ballot.
 */
export function detectRawBytesBmdBallot(data: Uint8Array): boolean {
  const prelude = data.slice(0, Prelude.length);
  return (
    prelude.length === Prelude.length &&
    prelude.every((byte, i) => byte === Prelude[i])
  );
}

/**
 * Detect whether `data` is a votingworks encoded ballot / metadata.
 */
export function isVxBallot(data: Uint8Array): boolean {
  return detectRawBytesBmdBallot(data);
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
}

/**
 * Encodes a {@link BallotConfig} into the given bit writer.
 */
export function encodeBallotConfigInto(
  election: Election,
  { ballotId, ballotStyleId, ballotType, isTestMode, precinctId }: BallotConfig,
  bits: BitWriter
): BitWriter {
  const { precincts, ballotStyles, contests } = election;
  const precinctCount = toUint8(precincts.length);
  const ballotStyleCount = toUint8(ballotStyles.length);
  const contestCount = toUint8(contests.length);
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
    .writeUint8(precinctCount, ballotStyleCount, contestCount)
    .writeUint(precinctIndex, { max: precinctCount - 1 })
    .writeUint(ballotStyleIndex, { max: ballotStyleCount - 1 });

  bits
    .writeBoolean(isTestMode)
    .writeUint(ballotType, { max: BallotTypeMaximumValue });

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
  bits: BitReader
): BallotConfig {
  const { precincts, ballotStyles, contests } = election;
  const precinctCount = bits.readUint8();
  const ballotStyleCount = bits.readUint8();
  const contestCount = bits.readUint8();

  if (precinctCount !== precincts.length) {
    throw new Error(
      `expected ${precincts.length} precinct(s), but read ${precinctCount} from encoded config`
    );
  }

  if (ballotStyleCount !== ballotStyles.length) {
    throw new Error(
      `expected ${ballotStyles.length} ballot style(s), but read ${ballotStyleCount} from encoded config`
    );
  }

  const precinctIndex = bits.readUint({ max: precinctCount - 1 });
  const ballotStyleIndex = bits.readUint({ max: ballotStyleCount - 1 });

  if (contestCount !== contests.length) {
    throw new Error(
      `expected ${contests.length} contest(s), but read ${contestCount} from encoded config`
    );
  }

  const isTestMode = bits.readBoolean();
  const ballotType = bits.readUint({ max: BallotTypeMaximumValue });
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
    ballotType,
    isTestMode,
    precinctId: precinct.id,
  };
}

function writeYesNoVote(bits: BitWriter, ynVote: YesNoVote): void {
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
  bits.writeBoolean(ynVote[0] === 'yes');
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

        writeYesNoVote(bits, ynVote);
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
          const writeInCount = choices.reduce(
            (count, choice) => count + (choice.isWriteIn ? 1 : 0),
            0
          );
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
    electionHash,
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
    .writeUint8(...Prelude)
    .writeString(electionHash.slice(0, ELECTION_HASH_LENGTH), {
      encoding: HexEncoding,
      includeLength: false,
      length: ELECTION_HASH_LENGTH,
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
      votes[contest.id] = bits.readBoolean() ? ['yes'] : ['no'];
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
  if (!bits.skipUint8(...Prelude)) {
    throw new Error(
      "expected leading prelude 'V' 'X' 0b00000002 but it was not found"
    );
  }

  const electionHash = bits.readString({
    encoding: HexEncoding,
    length: ELECTION_HASH_LENGTH,
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
    electionHash,
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
 * Reads the election hash from an encoded BMD ballot metadata.
 */
export function decodeElectionHashFromReader(
  bits: BitReader
): string | undefined {
  if (bits.skipUint8(...Prelude)) {
    return bits.readString({
      encoding: HexEncoding,
      length: ELECTION_HASH_LENGTH,
    });
  }
}

/**
 * Reads the election hash from an encoded ballot metadata.
 */
export function decodeElectionHash(data: Uint8Array): string | undefined {
  return decodeElectionHashFromReader(new BitReader(data));
}
