/* eslint-disable max-classes-per-file */
import { Buffer } from 'node:buffer';
import { inspect } from 'node:util';
import { assert, assertDefined } from '@votingworks/basics';
import { asHexString, Byte, isByte } from '@votingworks/types';

/**
 * The max length of an APDU
 */
export const MAX_APDU_LENGTH = 260;

/**
 * The max length of a command APDU's data. The `- 5` accounts for the CLA, INS, P1, P2, and Lc
 * (see CommandApdu below).
 */
export const MAX_COMMAND_APDU_DATA_LENGTH = MAX_APDU_LENGTH - 5;

/**
 * The max length of a response APDU's data. The `- 2` accounts for the status word (see
 * STATUS_WORD below).
 */
export const MAX_RESPONSE_APDU_DATA_LENGTH = MAX_APDU_LENGTH - 2;

/**
 * Because APDUs have a max length, commands involving larger amounts of data have to be sent as
 * multiple, chained APDUs. The APDU CLA indicates whether more data has yet to be provided.
 *
 * The CLA also indicates whether the APDU is a secure messaging APDU, i.e., being sent over a
 * secure channel. Secure channels are typically used for initial card configuration.
 */
const CLA = {
  STANDARD: 0x00,
  CHAINED: 0x10,

  /**
   * There are two kinds of Java Card secure messaging: GlobalPlatform format and ISO 7816-4
   * format. The former is supported by all of our Java Card stock, old JCOP 3 and new JCOP 4,
   * while the latter is only supported by our old JCOP 3 Java Card stock.
   *
   * The CLA for GlobalPlatform format secure messaging is 0x04; the CLA for ISO 7816-4 format
   * secure messaging is 0x0c.
   *
   * See https://globalplatform.org/wp-content/uploads/2018/05/GPC_CardSpecification_v2.3.1_PublicRelease_CC.pdf,
   * 11.1.4 Class Byte Encoding, for more context.
   */
  SECURE_MESSAGING: 0x04,
  SECURE_MESSAGING_CHAINED: 0x14,
} as const;

/**
 * APDU status words are analogous to HTTP status codes. Every response APDU ends with one, each
 * consisting of two bytes, commonly referred to as SW1 and SW2.
 *
 * - 0x90 0x00 is equivalent to an HTTP 200.
 * - 0x61 0xXX is also equivalent to an HTTP 200 but indicates that XX more bytes of response data
 *   have yet to be retrieved via a GET RESPONSE command. Like command APDUs, response APDUs have a
 *   max length.
 *
 * See https://www.eftlab.com/knowledge-base/complete-list-of-apdu-responses for a list of all
 * known status words.
 */
export const STATUS_WORD = {
  SUCCESS: { SW1: 0x90, SW2: 0x00 },
  SUCCESS_MORE_DATA_AVAILABLE: { SW1: 0x61 },
  VERIFY_FAIL: { SW1: 0x63 },
  SECURITY_CONDITION_NOT_SATISFIED: { SW1: 0x69, SW2: 0x82 },
  INCORRECT_DATA_FIELD_PARAMETERS: { SW1: 0x6a, SW2: 0x80 },
  FILE_NOT_FOUND: { SW1: 0x6a, SW2: 0x82 },
} as const;

/**
 * The SELECT command is a standard command for selecting an applet.
 */
export const SELECT = {
  INS: 0xa4,
  P1: 0x04,
  P2: 0x00,
} as const;

/**
 * The GET RESPONSE command is a standard command for retrieving additional APDU response data.
 */
export const GET_RESPONSE = {
  INS: 0xc0,
  P1: 0x00,
  P2: 0x00,
} as const;

function splitEvery2Characters(s: string): string[] {
  assert(s.length > 0 && s.length % 2 === 0);
  const sSplit = s.match(/.{2}/g);
  assert(sSplit !== null);
  return sSplit;
}

/**
 * Params for an APDU CLA. See {@link CLA} for more context.
 */
export interface ClaParams {
  chained?: boolean;
  secureMessaging?: boolean;
}

interface CommandApduInputBase {
  cla?: ClaParams;
  ins: Byte;
  p1: Byte;
  p2: Byte;
}

/**
 * The input to a {@link CommandApdu}
 */
type CommandApduInput =
  | (CommandApduInputBase & { data: Buffer })
  | (CommandApduInputBase & { lc: Byte });

/**
 * An APDU, or application protocol data unit, is the communication unit between a smart card
 * reader and a smart card. The smart card reader issues command APDUs to the smart card, and the
 * smart card sends response APDUs back.
 *
 * See https://docs.yubico.com/yesdk/users-manual/yubikey-reference/apdu.html for a great overview.
 */
export class CommandApdu {
  /** CLA: Class */
  private readonly cla: Byte;
  /** INS: Instruction */
  private readonly ins: Byte;
  /** P1: Param 1 */
  private readonly p1: Byte;
  /** P2: Param 2 */
  private readonly p2: Byte;
  /** Lc: Length of data */
  private readonly lc: Byte;
  /** Data */
  private readonly data: Buffer;

  constructor(input: CommandApduInput) {
    const cla = this.determineCla(input.cla);
    const lc = 'lc' in input ? input.lc : input.data.length;
    const data = 'lc' in input ? Buffer.of() : input.data;

    if (lc > MAX_COMMAND_APDU_DATA_LENGTH) {
      throw new Error('APDU data exceeds max command APDU data length');
    }
    assert(isByte(lc));

    this.cla = cla;
    this.ins = input.ins;
    this.p1 = input.p1;
    this.p2 = input.p2;
    this.lc = lc;
    this.data = data;
  }

  asBuffer(): Buffer {
    return Buffer.concat([
      Buffer.of(this.cla, this.ins, this.p1, this.p2, this.lc),
      this.data,
    ]);
  }

  asHexString(separator?: string): string {
    const buffer = this.asBuffer();
    const hexString = buffer.toString('hex');
    return separator
      ? splitEvery2Characters(hexString).join(separator)
      : hexString;
  }

  private determineCla(input: ClaParams = {}) {
    if (input.secureMessaging) {
      return input.chained
        ? CLA.SECURE_MESSAGING_CHAINED
        : CLA.SECURE_MESSAGING;
    }
    return input.chained ? CLA.CHAINED : CLA.STANDARD;
  }
}

interface CardCommandInput {
  ins: Byte;
  p1: Byte;
  p2: Byte;
  data?: Buffer;
}

/**
 * A layer of abstraction on top of CommandApdu that supports sending larger amounts of data
 * through multiple, chained APDUs.
 *
 * See CommandApdu for more context.
 */
export class CardCommand {
  /** INS: Instruction */
  private readonly ins: Byte;
  /** P1: Param 1 */
  private readonly p1: Byte;
  /** P2: Param 2 */
  private readonly p2: Byte;
  /** Data */
  private readonly data: Buffer;

  constructor(input: CardCommandInput) {
    this.ins = input.ins;
    this.p1 = input.p1;
    this.p2 = input.p2;
    this.data = input.data ?? Buffer.of();
  }

  /**
   * The command as a command APDU or command APDU chain
   */
  asCommandApdus(): CommandApdu[] {
    const apdus: CommandApdu[] = [];

    const numApdus = Math.max(
      Math.ceil(this.data.length / MAX_COMMAND_APDU_DATA_LENGTH),
      1 // Always construct at least one APDU since a command APDU with no data is valid
    );
    for (let i = 0; i < numApdus; i += 1) {
      const notLastApdu = i < numApdus - 1;
      apdus.push(
        new CommandApdu({
          cla: { chained: notLastApdu },
          ins: this.ins,
          p1: this.p1,
          p2: this.p2,
          data: this.data.subarray(
            i * MAX_COMMAND_APDU_DATA_LENGTH,
            // Okay if this is larger than this.data.length as .subarray() automatically caps
            i * MAX_COMMAND_APDU_DATA_LENGTH + MAX_COMMAND_APDU_DATA_LENGTH
          ),
        })
      );
    }

    return apdus;
  }
}

/**
 * A TLV, or tag-length-value, is a byte array that consists of:
 * 1. A tag indicating what the value is
 * 2. A length indicating the size of the value
 * 3. The value itself
 *
 * The data in command and response APDUs is often comprised of TLVs.
 */
export function constructTlv(
  tagAsByteOrBuffer: Byte | Buffer,
  value: Buffer
): Buffer {
  const tag = Buffer.isBuffer(tagAsByteOrBuffer)
    ? tagAsByteOrBuffer
    : Buffer.of(tagAsByteOrBuffer);

  /**
   * The convention for TLV length is as follows:
   * - 0xXX           if value length ≤ 0x80 bytes
   * - 0x81 0xXX      if value length > 0x80 and ≤ 0xff bytes
   * - 0x82 0xXX 0xXX if value length > 0xff and ≤ 0xffff bytes
   *
   * For example:
   * - 51 bytes   --> Buffer.of(51)            --> 0x33           (33 is 51 in hex)
   * - 147 bytes  --> Buffer.of(0x81, 147)     --> 0x81 0x93      (93 is 147 in hex)
   * - 3017 bytes --> Buffer.of(0x82, 11, 201) --> 0x82 0x0b 0xc9 (bc9 is 3017 in hex)
   */
  let lengthBytes: Buffer;
  if (value.length <= 0x80) {
    lengthBytes = Buffer.of(value.length);
  } else if (value.length <= 0xff) {
    lengthBytes = Buffer.of(0x81, value.length);
  } else if (value.length <= 0xffff) {
    // eslint-disable-next-line no-bitwise
    lengthBytes = Buffer.of(0x82, value.length >> 8, value.length & 0xff);
  } else {
    throw new Error(
      `TLV value length is too large for TLV encoding: ` +
        `0x${value.length.toString(16)} > 0xffff`
    );
  }

  return Buffer.concat([tag, lengthBytes, value]);
}

/**
 * A parsed TLV. See {@link constructTlv} for more context.
 */
export interface Tlv {
  tag: Buffer;
  length: Buffer;
  value: Buffer;
}

/**
 * Parses a TLV from a buffer, returning the remainder of the buffer and the parsed TLV. If the tag
 * does not match the expected tag, an error is thrown.
 */
export function parseTlvPartial(
  tagAsByteOrBuffer: Byte | Buffer,
  tlv: Buffer
): [tlv: Tlv, remainder: Buffer] {
  const expectedTag = Buffer.isBuffer(tagAsByteOrBuffer)
    ? tagAsByteOrBuffer
    : Buffer.of(tagAsByteOrBuffer);
  const tagLength = expectedTag.length;
  const tag = tlv.subarray(0, tagLength);
  assert(
    tag.equals(expectedTag),
    `TLV tag (${inspect(tag)}) ` +
      `does not match expected tag (${inspect(expectedTag)})`
  );

  let lengthBytesLength: number;
  let valueLength: number;
  const firstLengthByte = assertDefined(
    tlv.at(tagLength),
    'TLV length is missing'
  );
  if (firstLengthByte <= 0x80) {
    lengthBytesLength = 1;
    valueLength = firstLengthByte;
  } else if (firstLengthByte === 0x81) {
    const secondLengthByte = assertDefined(
      tlv.at(tagLength + 1),
      'TLV length is missing expected second byte'
    );
    lengthBytesLength = 2;
    valueLength = secondLengthByte;
  } else if (firstLengthByte === 0x82) {
    const secondLengthByte = assertDefined(
      tlv.at(tagLength + 1),
      'TLV length is missing expected second byte'
    );
    const thirdLengthByte = assertDefined(
      tlv.at(tagLength + 2),
      'TLV length is missing expected third byte'
    );
    lengthBytesLength = 3;
    // eslint-disable-next-line no-bitwise
    valueLength = (secondLengthByte << 8) + thirdLengthByte;
  } else {
    throw new Error(
      'TLV length first byte is too large: ' +
        `0x${firstLengthByte.toString(16)} > 0x82`
    );
  }

  const lengthBytes = tlv.subarray(tagLength, tagLength + lengthBytesLength);
  const value = tlv.subarray(
    tagLength + lengthBytesLength,
    tagLength + lengthBytesLength + valueLength
  );
  const remainder = tlv.subarray(tagLength + lengthBytesLength + valueLength);

  return [{ tag, length: lengthBytes, value }, remainder];
}

/**
 * The inverse of {@link constructTlv}, splits a TLV into its tag, length, and value. If the tag
 * does not match the expected tag, an error is thrown. If the entire TLV is not consumed, an error
 * is thrown.
 */
export function parseTlv(tagAsByteOrBuffer: Byte | Buffer, data: Buffer): Tlv {
  const [tlv, remainder] = parseTlvPartial(tagAsByteOrBuffer, data);
  assert(
    remainder.length === 0,
    `TLV was not fully consumed: remainder=${remainder.toString('hex')}`
  );
  return tlv;
}

/**
 * A response APDU with an error status word
 */
export class ResponseApduError extends Error {
  private readonly sw1: Byte;
  private readonly sw2: Byte;

  constructor(statusWord: [Byte, Byte]) {
    const [sw1, sw2] = statusWord;
    super(
      'Received response APDU with error status word: ' +
        `${asHexString(sw1)} ${asHexString(sw2)}`
    );
    this.sw1 = sw1;
    this.sw2 = sw2;
  }

  statusWord(): [Byte, Byte] {
    return [this.sw1, this.sw2];
  }

  hasStatusWord(statusWord: [Byte, Byte]): boolean {
    const [sw1, sw2] = statusWord;
    return this.sw1 === sw1 && this.sw2 === sw2;
  }
}
