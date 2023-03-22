import { iter } from '@votingworks/basics';
import { safeParseNumber } from '@votingworks/types';
import { assert } from 'console';

type Bit = 0 | 1;

function numberToBitsRtl(num: number, bitLength: number): Bit[] {
  return num
    .toString(2)
    .padStart(bitLength, '0')
    .split('')
    .map((char) => (char === '0' ? 0 : 1))
    .reverse();
}

/**
 * Encodes ballot metadata as the bottom row of timing marks on a ballot.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function main(args: string[]): Promise<number> {
  assert(
    args.length === 1,
    'Usage: ./bin/encode_ballot_metadata <ballot_style_index>'
  );
  const ballotStyleIndex = safeParseNumber(args[0]).assertOk(
    'ballot_style_index must be a number'
  );
  const ballotStyleId = `card-number-${ballotStyleIndex}`;

  const frontMetadataWithoutChecksum = {
    /**
     * Mod 4 check sum from bits 0-1 (2 bits).
     *
     * The mod 4 check sum bits are obtained by adding the number of 1’s in bits 2
     * through 31, then encoding the results of a mod 4 operation in bits 0 and 1.
     * For example, if bits 2 through 31 have 18 1’s, bits 0 and 1 will hold the
     * value 2 (18 mod 4 = 2).
     */
    // mod4Checksum: u8;

    /** Batch or precinct number from bits 2-14 (13 bits). */
    batchOrPrecinctNumber: {
      value: 0, // Unused, arbitrary
      bitLength: 13,
    },

    /** Card number (CardRotID) from bits 15-27 (13 bits). */
    cardNumber: {
      value: ballotStyleIndex,
      bitLength: 13,
    },

    /** Sequence number (always 0) from bits 28-30 (3 bits). */
    sequenceNumber: {
      value: 0, // Unused
      bitLength: 3,
    },

    /** Start bit (always 1) from bit 31-31 (1 bit). */
    startBit: {
      value: 1,
      bitLength: 1,
    },
  } as const;

  const frontBitsWithoutChecksum = Object.values(
    frontMetadataWithoutChecksum
  ).flatMap(({ value, bitLength }) => numberToBitsRtl(value, bitLength));

  const frontChecksum = iter(frontBitsWithoutChecksum).sum() % 4;
  const frontBits = [
    ...numberToBitsRtl(frontChecksum, 2),
    ...frontBitsWithoutChecksum,
  ];
  assert(frontBits.length === 32);

  const backMetadataBits = {
    /** Election day of month (1..31) from bits 0-4 (5 bits). */
    electionDay: {
      value: 9,
      bitLength: 5,
    },

    /** Election month (1..12) from bits 5-8 (4 bits). */
    electionMonth: {
      value: 5,
      bitLength: 4,
    },

    /** Election year (2 digits) from bits 9-15 (7 bits). */
    electionYear: {
      value: 23,
      bitLength: 7,
    },

    /**
     * Election type from bits 16-20 (5 bits).
     *
     * @example "G" for general election
     */
    electionType: {
      value: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf('T'), // T for Town?
      bitLength: 5,
    },

    /** Ender code (binary 01111011110) from bits 21-31 (11 bits). */
    enderCode: {
      value: 0b01111011110,
      bitLength: 11,
    },
  } as const;

  const backBits = Object.values(backMetadataBits).flatMap(
    ({ value, bitLength }) => numberToBitsRtl(value, bitLength)
  );

  const frontTimingMarks: Bit[] = [1, ...frontBits.reverse(), 1];
  const backTimingMarks: Bit[] = [1, ...backBits.reverse(), 1];

  function prettyTimingMarks(timingMarks: Bit[]): string {
    const marks = timingMarks.map((bit) => (bit === 1 ? '⬛️' : '⬜'));
    const indices = timingMarks.map((_, i) => i.toString().padStart(2, ' '));
    return `${marks.join(' ')}\n${indices.join(' ')}\n`;
  }

  process.stdout.write(`Ballot Style ID: ${ballotStyleId}\n\n`);
  process.stdout.write(`Front:\n${prettyTimingMarks(frontTimingMarks)}\n`);
  process.stdout.write(`Back:\n${prettyTimingMarks(backTimingMarks)}\n`);
  return 0;
}
