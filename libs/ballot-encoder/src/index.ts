import {
  Contest,
  BallotIdSchema,
  BallotStyleId,
  BallotType,
  BallotTypeMaximumValue,
  SummaryBallotPageMetadata,
  Candidate,
  CandidateVote,
  ContestId,
  Election,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  HmpbBallotPageMetadata,
  isVotePresent,
  PrecinctId,
  straightPartyNotYetImplemented,
  unsafeParse,
  VotesDict,
  BallotMeasureContest,
  BallotMeasureVote,
} from '@votingworks/types';
import { assert, assertDefined, iter } from '@votingworks/basics';
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
 * Maximum number of pages in a bubble ballot.
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
 * The bytes we expect a bubble ballot to start with.
 */
export const BubbleBallotPrelude: readonly Uint8[] = [
  /* V */ 86, /* P = Paper */ 80, /* version = */ 2,
];

/**
 * The bytes we expect a summary ballot to start with.
 */
export const SummaryBallotPrelude: readonly Uint8[] = [
  /* V */ 86, /* B = summary ballot */ 66, /* version = */ 1,
];

/**
 * Detect whether `data` is a VotingWorks encoded ballot / metadata.
 */
export function isVxBallot(data: Uint8Array): boolean {
  const prelude = data.slice(0, SummaryBallotPrelude.length);
  return (
    prelude.length === SummaryBallotPrelude.length &&
    prelude.every((byte, i) => byte === SummaryBallotPrelude[i])
  );
}

/**
 * Data needed to uniquely identify a ballot page, possibly including an ID.
 */
export interface BallotConfig {
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  isTestMode: boolean;
  precinctId: PrecinctId;
  pageNumber: number;
  /**
   * Appears on bubble ballots only when using the
   * SystemSettings.precinctScanEnableBallotAuditIds feature.
   */
  ballotAuditId?: string;
}

/**
 * Encodes a {@link BallotConfig} into the given bit writer.
 */
export function encodeBallotConfigInto(
  election: Election,
  {
    ballotStyleId,
    ballotType,
    isTestMode,
    precinctId,
    pageNumber,
    ballotAuditId,
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
    .writeUint(ballotStyleIndex, { max: MAXIMUM_BALLOT_STYLES })
    .writeUint(pageNumber, { max: MAXIMUM_PAGE_NUMBERS });

  bits.writeBoolean(isTestMode);

  const ballotTypeIndex = Object.values(BallotType).indexOf(ballotType);
  bits.writeUint(ballotTypeIndex, { max: BallotTypeMaximumValue });

  bits.writeBoolean(ballotAuditId !== undefined);
  if (ballotAuditId) {
    bits.writeString(ballotAuditId);
  }

  return bits;
}

function writeBallotMeasureVote(
  bits: BitWriter,
  bmVote: BallotMeasureVote,
  contest: BallotMeasureContest
): void {
  if (!Array.isArray(bmVote)) {
    throw new Error(
      `cannot encode a non-array ballot measure vote: ${JSON.stringify(bmVote)}`
    );
  }

  if (bmVote.length > 1) {
    throw new Error(
      `cannot encode a ballot measure overvote: ${JSON.stringify(bmVote)}`
    );
  }

  // ballot measure votes get a single bit
  bits.writeBoolean(bmVote[0] === assertDefined(contest.options[0]).id);
}

function encodeBallotVotesInto(
  contests: readonly Contest[],
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
      /* istanbul ignore next */
      if (contest.type === 'straight-party') {
        return straightPartyNotYetImplemented();
      }
      if (contest.type === 'measure') {
        const bmVote = contestVote as BallotMeasureVote;

        writeBallotMeasureVote(bits, bmVote, contest);
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

function decodeBallotVotes(
  contests: readonly Contest[],
  bits: BitReader
): VotesDict {
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
    /* istanbul ignore next */
    if (contest.type === 'straight-party') {
      return straightPartyNotYetImplemented();
    }
    if (contest.type === 'measure') {
      // ballot measure votes get a single bit
      votes[contest.id] = bits.readBoolean()
        ? [assertDefined(contest.options[0]).id]
        : [assertDefined(contest.options[1]).id];
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
 * Reads the ballot hash from an encoded ballot metadata.
 */
export function decodeBallotHashFromReader(
  bits: BitReader
): string | undefined {
  if (
    bits.skipUint8(...BubbleBallotPrelude) ||
    bits.skipUint8(...SummaryBallotPrelude)
  ) {
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
 * Encodes a bubble ballot's metadata into a bit writer.
 */
export function encodeHmpbBallotPageMetadataInto(
  election: Election,
  {
    ballotStyleId,
    ballotType,
    ballotHash,
    isTestMode,
    pageNumber,
    precinctId,
    ballotAuditId,
  }: HmpbBallotPageMetadata,
  bits: BitWriter
): BitWriter {
  return bits
    .writeUint8(...BubbleBallotPrelude)
    .writeString(sliceBallotHashForEncoding(ballotHash), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    .with(() =>
      encodeBallotConfigInto(
        election,
        {
          ballotStyleId,
          ballotType,
          isTestMode,
          pageNumber,
          precinctId,
          ballotAuditId,
        },
        bits
      )
    );
}

/**
 * Encodes bubble ballot page metadata as a byte array.
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

/**
 * Maximum number of pages in a summary ballot (same as bubble ballot).
 */
export const MAXIMUM_SUMMARY_BALLOT_PAGES = MAXIMUM_PAGE_NUMBERS;

/**
 * Data for a single page of a summary ballot.
 */
export interface SummaryBallotPage {
  ballotHash: string;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  isTestMode: boolean;
  ballotType: BallotType;
  pageNumber: number;
  totalPages: number;
  ballotAuditId: string;
  /** The contests included on this page */
  contests: readonly Contest[];
  /** Votes for the contests on this page */
  votes: VotesDict;
}

/**
 * Encodes a summary ballot config (with page info) into the given bit writer.
 */
function encodeSummaryBallotConfigInto(
  election: Election,
  {
    ballotStyleId,
    ballotType,
    isTestMode,
    precinctId,
    pageNumber,
    totalPages,
    ballotAuditId,
  }: Omit<SummaryBallotPage, 'contests' | 'votes' | 'ballotHash'>,
  bits: BitWriter
): BitWriter {
  const { precincts, ballotStyles } = election;
  const precinctIndex = precincts.findIndex((p) => p.id === precinctId);
  const ballotStyleIndex = ballotStyles.findIndex(
    (bs) => bs.id === ballotStyleId
  );

  assert(precinctIndex !== -1, `precinct ID not found: ${precinctId}`);
  assert(
    ballotStyleIndex !== -1,
    `ballot style ID not found: ${ballotStyleId}`
  );

  bits
    .writeUint(precinctIndex, { max: MAXIMUM_PRECINCTS })
    .writeUint(ballotStyleIndex, { max: MAXIMUM_BALLOT_STYLES })
    .writeUint(pageNumber, { max: MAXIMUM_SUMMARY_BALLOT_PAGES })
    .writeUint(totalPages, { max: MAXIMUM_SUMMARY_BALLOT_PAGES })
    .writeBoolean(isTestMode);

  const ballotTypeIndex = Object.values(BallotType).indexOf(ballotType);
  bits.writeUint(ballotTypeIndex, { max: BallotTypeMaximumValue });

  // Ballot audit ID is required for summary ballots
  bits.writeString(ballotAuditId);

  return bits;
}

/**
 * Encodes a single page of a summary ballot into a bit writer.
 */
export function encodeSummaryBallotPageInto(
  election: Election,
  {
    ballotHash,
    ballotStyleId,
    precinctId,
    isTestMode,
    ballotType,
    pageNumber,
    totalPages,
    ballotAuditId,
    contests,
    votes,
  }: SummaryBallotPage,
  bits: BitWriter
): BitWriter {
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle, `ballot style not found: ${ballotStyleId}`);
  const allContests = getContests({ ballotStyle, election });

  // Encode which contests are on this page as a bitmap
  // One bit per contest in the ballot style, true if contest is on this page
  const contestsOnPage = new Set(contests.map((c) => c.id));

  return bits
    .writeUint8(...SummaryBallotPrelude)
    .writeString(sliceBallotHashForEncoding(ballotHash), {
      encoding: HexEncoding,
      includeLength: false,
      length: BALLOT_HASH_ENCODING_LENGTH,
    })
    .with(() =>
      encodeSummaryBallotConfigInto(
        election,
        {
          ballotStyleId,
          precinctId,
          isTestMode,
          ballotType,
          pageNumber,
          totalPages,
          ballotAuditId,
        },
        bits
      )
    )
    .with(() => {
      // Write contest bitmap: which contests are on this page
      for (const contest of allContests) {
        bits.writeBoolean(contestsOnPage.has(contest.id));
      }
      return bits;
    })
    .with(() => encodeBallotVotesInto(contests, votes, bits));
}

/**
 * Encodes a single page of a summary ballot as a byte array.
 */
export function encodeSummaryBallotPage(
  election: Election,
  page: SummaryBallotPage
): Uint8Array {
  const bits = new BitWriter();
  encodeSummaryBallotPageInto(election, page, bits);
  return bits.toUint8Array();
}

/**
 * Decodes a summary ballot config from a bit reader.
 */
function decodeSummaryBallotConfigFromReader(
  election: Election,
  bits: BitReader
): Omit<SummaryBallotPageMetadata, 'ballotHash' | 'contestIds'> {
  const { precincts, ballotStyles } = election;

  const precinctIndex = bits.readUint({ max: MAXIMUM_PRECINCTS });
  const ballotStyleIndex = bits.readUint({ max: MAXIMUM_BALLOT_STYLES });
  const pageNumber = bits.readUint({
    max: MAXIMUM_SUMMARY_BALLOT_PAGES,
  });
  const totalPages = bits.readUint({
    max: MAXIMUM_SUMMARY_BALLOT_PAGES,
  });
  const isTestMode = bits.readBoolean();

  const ballotTypeIndex = bits.readUint({ max: BallotTypeMaximumValue });
  const ballotType = assertDefined(
    Object.values(BallotType)[ballotTypeIndex],
    `ballot type index ${ballotTypeIndex} is invalid`
  );

  // Ballot audit ID is required for summary ballots
  const ballotAuditId = unsafeParse(BallotIdSchema, bits.readString());

  const ballotStyle = ballotStyles[ballotStyleIndex];
  const precinct = precincts[precinctIndex];

  assert(ballotStyle, `ballot style index ${ballotStyleIndex} is invalid`);
  assert(precinct, `precinct index ${precinctIndex} is invalid`);

  return {
    ballotStyleId: ballotStyle.id,
    precinctId: precinct.id,
    pageNumber,
    totalPages,
    isTestMode,
    ballotType,
    ballotAuditId,
  };
}

/**
 * Result of decoding a summary ballot page.
 */
export interface DecodedSummaryBallotPage {
  metadata: SummaryBallotPageMetadata;
  votes: VotesDict;
}

/**
 * Decodes a single page of a summary ballot from a bit reader.
 */
export function decodeSummaryBallotPageFromReader(
  electionDefinition: ElectionDefinition,
  bits: BitReader
): DecodedSummaryBallotPage {
  assert(
    bits.skipUint8(...SummaryBallotPrelude),
    'invalid summary ballot prelude'
  );

  const ballotHash = bits.readString({
    encoding: HexEncoding,
    length: BALLOT_HASH_ENCODING_LENGTH,
  });

  assert(
    ballotHash === sliceBallotHashForEncoding(electionDefinition.ballotHash),
    `unexpected ballot hash '${ballotHash}' (expected '${electionDefinition.ballotHash}')`
  );

  const { election } = electionDefinition;
  const config = decodeSummaryBallotConfigFromReader(election, bits);
  const { ballotStyleId } = config;

  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  assert(ballotStyle, `invalid ballot style id: ${ballotStyleId}`);

  const allContests = getContests({ ballotStyle, election });

  // Read contest bitmap: which contests are on this page
  const contestIds: ContestId[] = [];
  const contestsOnThisPage: Contest[] = [];
  for (const contest of allContests) {
    if (bits.readBoolean()) {
      contestIds.push(contest.id);
      contestsOnThisPage.push(contest);
    }
  }

  // Decode votes for only the contests on this page
  const votes = decodeBallotVotes(contestsOnThisPage, bits);

  readPaddingToEnd(bits);

  return {
    metadata: {
      ballotHash,
      ...config,
      contestIds,
    },
    votes,
  };
}

/**
 * Decodes a single page of a summary ballot from a byte array.
 */
export function decodeSummaryBallotPage(
  electionDefinition: ElectionDefinition,
  data: Uint8Array
): DecodedSummaryBallotPage {
  return decodeSummaryBallotPageFromReader(
    electionDefinition,
    new BitReader(data)
  );
}
