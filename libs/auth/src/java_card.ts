import { Buffer } from 'buffer';
import { sha256 } from 'js-sha256';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Byte, Optional, User } from '@votingworks/types';

import {
  CardCommand,
  constructTlv,
  parseTlv,
  ResponseApduError,
  SELECT,
  STATUS_WORD,
} from './apdu';
import { Card, CardStatus, CheckPinResponse } from './card';
import { CardReader } from './card_reader';
import { openssl } from './openssl';

/**
 * The OpenFIPS201 applet ID
 */
const OPENFIPS201_AID = Buffer.from([
  0xa0, 0x00, 0x00, 0x03, 0x08, 0x00, 0x00, 0x10, 0x00, 0x01, 0x00,
]);

const DEFAULT_PIN = '000000';

/**
 * The GENERAL AUTHENTICATE command is a PIV command that initiates an authentication protocol.
 */
const GENERAL_AUTHENTICATE = {
  INS: 0x87,
  /** The P1 for a 256-bit ECC key pair */
  P1_ECC256: 0x11,
  DYNAMIC_AUTHENTICATION_TEMPLATE_TAG: 0x7c,
  CHALLENGE_TAG: 0x81,
  RESPONSE_TAG: 0x82,
} as const;

/**
 * The GET DATA command is a PIV command that retrieves a data object.
 */
const GET_DATA = {
  INS: 0xcb,
  P1: 0x3f,
  P2: 0xff,
  TAG_LIST_TAG: 0x5c,
} as const;

/**
 * The PUT DATA command is a PIV command that stores a data object.
 */
const PUT_DATA = {
  INS: 0xdb,
  P1: 0x3f,
  P2: 0xff,
  TAG_LIST_TAG: 0x5c,
  DATA_TAG: 0x53,
} as const;

/**
 * The VERIFY command is a PIV command that performs various forms of user verification, including
 * PIN checks.
 */
const VERIFY = {
  INS: 0x20,
  P1_VERIFY: 0x00,
  P2_PIN: 0x80,
} as const;

/**
 * Data object IDs of the format 0x5f 0xc1 0xXX are a PIV convention.
 */
function pivDataObjectId(uniqueByte: Byte) {
  return Buffer.from([0x5f, 0xc1, uniqueByte]);
}

/**
 * The card's VotingWorks-issued cert
 */
const CARD_VX_CERT = {
  PRIVATE_KEY_SLOT: 0xf0,
  OBJECT_ID: pivDataObjectId(0xf0),
} as const;

/**
 * The card's VxAdmin-issued cert
 */
const CARD_VX_ADMIN_CERT = {
  PRIVATE_KEY_SLOT: 0xf1,
  OBJECT_ID: pivDataObjectId(0xf1),
} as const;

/**
 * The cert authority cert of the VxAdmin that programmed the card
 */
const VX_ADMIN_CERT_AUTHORITY_CERT = {
  OBJECT_ID: pivDataObjectId(0xf2),
} as const;

/**
 * An upper bound on the size of a single data object. Though a TLV value can be up to 65,535 bytes
 * long (0xffff in hex), OpenFIPS201 caps total TLV length (including tag and length) at 32,767
 * bytes (0x7fff in hex). This allows for a max data object size of:
 *
 * 32,767 bytes - 1 byte for the data tag - 3 bytes for the 0x82 0xXX 0xXX length = 32,763 bytes
 *
 * Confirmed that this really is the max through manual testing. Trying to store a data object of
 * size MAX_DATA_OBJECT_SIZE_BYTES + 1 results in an invalid-data status word (0x6a 0x80).
 */
const MAX_DATA_OBJECT_SIZE_BYTES = 32763;

/**
 * The card's generic storage space for non-auth data. We use multiple data objects under the hood
 * to increase capacity.
 */
const GENERIC_STORAGE_SPACE = {
  OBJECT_IDS: [
    pivDataObjectId(0xf3),
    pivDataObjectId(0xf4),
    pivDataObjectId(0xf5),
  ],
} as const;

/**
 * A rough upper bound on the capacity of the card's generic storage space. Though we use 144KB
 * Java Cards, much of that space is consumed by the card OS, the OpenFIPS201 applet, and (to a
 * far lesser degree) our auth keys and certs.
 *
 * Identified this limit through manual testing and intentionally left some breathing room (~10%).
 * Hitting card capacity results in an OS-error status word (0x6f 0x00).
 */
const GENERIC_STORAGE_SPACE_CAPACITY_BYTES = 90000;

/**
 * VotingWorks's IANA-assigned enterprise OID
 */
const VX_IANA_ENTERPRISE_OID = '1.3.6.1.4.1.59817';

/**
 * Instead of overloading existing X.509 cert fields, we're using our own custom cert fields.
 */
const VX_CUSTOM_CERT_FIELD = {
  /** One of: card, admin, central-scan, mark, scan (the latter four referring to machines) */
  COMPONENT: `${VX_IANA_ENTERPRISE_OID}.1`,
  /** Format: {state-2-letter-abbreviation}.{county-or-town} (e.g. MS.Warren) */
  JURISDICTION: `${VX_IANA_ENTERPRISE_OID}.2`,
  /** One of: sa, em, pw (system administrator, election manager, or poll worker) */
  CARD_TYPE: `${VX_IANA_ENTERPRISE_OID}.3`,
  /** The SHA-256 hash of the election definition  */
  ELECTION_HASH: `${VX_IANA_ENTERPRISE_OID}.4`,
} as const;

/**
 * Parsed custom cert fields
 */
interface VxCustomCertFields {
  component: 'card' | 'admin' | 'central-scan' | 'mark' | 'scan';
  jurisdiction: string;
  cardType?: 'sa' | 'em' | 'pw';
  electionHash?: string;
}

const VxCustomCertFieldsSchema: z.ZodSchema<VxCustomCertFields> = z.object({
  component: z.enum(['card', 'admin', 'central-scan', 'mark', 'scan']),
  jurisdiction: z.string(),
  cardType: z.optional(z.enum(['sa', 'em', 'pw'])),
  electionHash: z.optional(z.string()),
});

/**
 * Converts a PIN to the padded 8-byte buffer that the VERIFY command expects
 */
function construct8BytePinBuffer(pin: string) {
  return Buffer.concat([
    Buffer.from(pin, 'utf-8'),
    Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), // Padding
  ]).subarray(0, 8);
}

/**
 * The incorrect-PIN status word has the format 0x63 0xcX, where X is the number of remaining PIN
 * entry attempts before complete lockout (X being a hex digit).
 */
function isIncorrectPinStatusWord(statusWord: [Byte, Byte]): boolean {
  const [sw1, sw2] = statusWord;
  // eslint-disable-next-line no-bitwise
  return sw1 === STATUS_WORD.VERIFY_FAIL.SW1 && sw2 >> 4 === 0x0c;
}

/**
 * See isIncorrectPinStatusWord().
 */
function numRemainingAttemptsFromIncorrectPinStatusWord(
  statusWord: [Byte, Byte]
): number {
  assert(isIncorrectPinStatusWord(statusWord));
  const [, sw2] = statusWord;
  // Extract the last 4 bits of SW2
  // eslint-disable-next-line no-bitwise
  return sw2 & 0x0f;
}

/**
 * An implementation of the card API that uses a Java Card running our fork of the OpenFIPS201
 * applet (https://github.com/votingworks/openfips201) and X.509 certs. The implementation takes
 * inspiration from the NIST PIV standard but diverges where PIV doesn't suit our needs.
 */
export class JavaCard implements Card {
  private readonly cardReader: CardReader;
  private cardStatus: CardStatus;
  private readonly jurisdiction: string;
  private readonly vxCertAuthorityCertPath: string;

  constructor(input: {
    jurisdiction: string;
    vxCertAuthorityCertPath: string;
  }) {
    this.cardStatus = { status: 'no_card' };
    this.jurisdiction = input.jurisdiction;
    this.vxCertAuthorityCertPath = input.vxCertAuthorityCertPath;

    this.cardReader = new CardReader({
      onReaderStatusChange: async (readerStatus) => {
        switch (readerStatus) {
          case 'no_card':
          case 'no_card_reader': {
            this.cardStatus = { status: 'no_card' };
            return;
          }
          case 'card_error': {
            this.cardStatus = { status: 'card_error' };
            return;
          }
          case 'unknown_error': {
            this.cardStatus = { status: 'unknown_error' };
            return;
          }
          case 'ready': {
            const user = await this.safeReadUser();
            this.cardStatus = { status: 'ready', user };
            return;
          }
          default: {
            throwIllegalValue(readerStatus);
          }
        }
      },
    });
  }

  async getCardStatus(): Promise<CardStatus> {
    return Promise.resolve(this.cardStatus);
  }

  async checkPin(pin: string): Promise<CheckPinResponse> {
    const cardVxAdminCert = await this.retrieveCert(
      CARD_VX_ADMIN_CERT.OBJECT_ID
    );
    try {
      // Verify that the card has a private key that corresponds to the public key in the card
      // VxAdmin cert
      await this.verifyCardPrivateKey(
        CARD_VX_ADMIN_CERT.PRIVATE_KEY_SLOT,
        cardVxAdminCert,
        pin
      );
    } catch (error) {
      if (
        error instanceof ResponseApduError &&
        isIncorrectPinStatusWord(error.statusWord())
      ) {
        return {
          response: 'incorrect',
          numRemainingAttempts: numRemainingAttemptsFromIncorrectPinStatusWord(
            error.statusWord()
          ),
        };
      }
      return { response: 'error' };
    }
    return { response: 'correct' };
  }

  program(): Promise<void> {
    return Promise.resolve();
  }

  unprogram(): Promise<void> {
    return Promise.resolve();
  }

  async readData(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for (const objectId of GENERIC_STORAGE_SPACE.OBJECT_IDS) {
      let response: Buffer;
      try {
        response = await this.cardReader.transmit(
          new CardCommand({
            ins: GET_DATA.INS,
            p1: GET_DATA.P1,
            p2: GET_DATA.P2,
            data: constructTlv(GET_DATA.TAG_LIST_TAG, objectId),
          })
        );
      } catch (error) {
        if (
          error instanceof ResponseApduError &&
          error.hasStatusWord([
            STATUS_WORD.FILE_NOT_FOUND.SW1,
            STATUS_WORD.FILE_NOT_FOUND.SW2,
          ])
        ) {
          chunks.push(Buffer.from([]));
          continue;
        }
        throw error;
      }
      const [, , chunk] = parseTlv(PUT_DATA.DATA_TAG, response);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async writeData(data: Buffer): Promise<void> {
    if (data.length > GENERIC_STORAGE_SPACE_CAPACITY_BYTES) {
      throw new Error('Not enough space on card');
    }

    for (const [i, objectId] of GENERIC_STORAGE_SPACE.OBJECT_IDS.entries()) {
      const chunk = data.subarray(
        // Okay if these are larger than data.length
        MAX_DATA_OBJECT_SIZE_BYTES * i,
        MAX_DATA_OBJECT_SIZE_BYTES * i + MAX_DATA_OBJECT_SIZE_BYTES
      );
      await this.cardReader.transmit(
        new CardCommand({
          ins: PUT_DATA.INS,
          p1: PUT_DATA.P1,
          p2: PUT_DATA.P2,
          data: Buffer.concat([
            constructTlv(PUT_DATA.TAG_LIST_TAG, objectId),
            constructTlv(PUT_DATA.DATA_TAG, chunk),
          ]),
        })
      );
    }
  }

  clearData(): Promise<void> {
    return this.writeData(Buffer.from([]));
  }

  /**
   * We wrap this.readUser() because it:
   * 1. Intentionally throws errors if any verification fails
   * 2. Can throw errors due to external actions like preemptively removing the card from the card
   *    reader
   */
  private async safeReadUser(): Promise<Optional<User>> {
    try {
      return await this.readUser();
    } catch {
      return undefined;
    }
  }

  /**
   * Reads the user on the card, performing various forms of verification along the way. Throws an
   * error if any verification fails.
   */
  private async readUser(): Promise<Optional<User>> {
    await this.selectApplet();

    // Verify that the card VotingWorks cert was signed by VotingWorks
    const cardVxCert = await this.retrieveCert(CARD_VX_CERT.OBJECT_ID);
    await openssl([
      'verify',
      '-CAfile',
      this.vxCertAuthorityCertPath,
      cardVxCert,
    ]);

    // Verify that the card VxAdmin cert was signed by VxAdmin
    const cardVxAdminCert = await this.retrieveCert(
      CARD_VX_ADMIN_CERT.OBJECT_ID
    );
    const vxAdminCertAuthorityCert = await this.retrieveCert(
      VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID
    );
    await openssl([
      'verify',
      '-CAfile',
      vxAdminCertAuthorityCert,
      cardVxAdminCert,
    ]);

    // Verify that the VxAdmin cert authority cert is 1) a valid VxAdmin cert, 2) for the correct
    // jurisdiction, and 3) signed by VotingWorks
    // TODO: Figure out how to sign the VxAdmin cert authority cert with the VotingWorks cert
    // authority cert
    const vxAdminCertAuthorityCertDetails = await this.parseCert(
      vxAdminCertAuthorityCert
    );
    assert(vxAdminCertAuthorityCertDetails.component === 'admin');
    assert(vxAdminCertAuthorityCertDetails.jurisdiction === this.jurisdiction);
    await openssl([
      'verify',
      '-CAfile',
      this.vxCertAuthorityCertPath,
      vxAdminCertAuthorityCert,
    ]);

    // Verify that the card has a private key that corresponds to the public key in the card
    // VotingWorks cert
    await this.verifyCardPrivateKey(CARD_VX_CERT.PRIVATE_KEY_SLOT, cardVxCert);

    const user = await this.parseUserDataFromCert(cardVxAdminCert);

    /**
     * If the user doesn't have a PIN:
     * Verify that the card has a private key that corresponds to the public key in the card
     * VxAdmin cert
     *
     * If the user does have a PIN:
     * Perform this verification later in checkPin because operations with this private key are
     * PIN-gated
     */
    if (user?.role === 'poll_worker') {
      await this.verifyCardPrivateKey(
        CARD_VX_ADMIN_CERT.PRIVATE_KEY_SLOT,
        cardVxAdminCert,
        DEFAULT_PIN
      );
    }

    return user;
  }

  private async selectApplet(): Promise<void> {
    await this.cardReader.transmit(
      new CardCommand({
        ins: SELECT.INS,
        p1: SELECT.P1,
        p2: SELECT.P2,
        data: OPENFIPS201_AID,
      })
    );
  }

  /**
   * Retrieves the specified cert in PEM format
   */
  private async retrieveCert(certObjectId: Buffer): Promise<Buffer> {
    const getDataResult = await this.cardReader.transmit(
      new CardCommand({
        ins: GET_DATA.INS,
        p1: GET_DATA.P1,
        p2: GET_DATA.P2,
        data: constructTlv(GET_DATA.TAG_LIST_TAG, certObjectId),
      })
    );
    const certInDerFormat = getDataResult.subarray(8, -5); // Trim metadata
    const certInPemFormat = await openssl([
      'x509',
      '-inform',
      'DER',
      '-outform',
      'PEM',
      '-in',
      certInDerFormat,
    ]);
    return certInPemFormat;
  }

  /**
   * Verifies that the card private key in the specified slot corresponds to the public key in the
   * provided cert by 1) having the private key sign a "challenge" and 2) using the public key to
   * verify the generated signature.
   *
   * A PIN must be provided if operations with the specified private key are PIN-gated.
   */
  private async verifyCardPrivateKey(
    privateKeySlot: Byte,
    cert: Buffer,
    pin?: string
  ) {
    if (pin) {
      // Check the PIN
      await this.cardReader.transmit(
        new CardCommand({
          ins: VERIFY.INS,
          p1: VERIFY.P1_VERIFY,
          p2: VERIFY.P2_PIN,
          data: construct8BytePinBuffer(pin),
        })
      );
    }

    // Have the private key in the specified slot sign a "challenge"
    const challenge = `VotingWorks/${new Date().toISOString()}/${uuid()}`;
    const challengeHash = Buffer.from(sha256(challenge), 'hex');
    const generalAuthenticateResponse = await this.cardReader.transmit(
      new CardCommand({
        ins: GENERAL_AUTHENTICATE.INS,
        p1: GENERAL_AUTHENTICATE.P1_ECC256,
        p2: privateKeySlot,
        data: constructTlv(
          GENERAL_AUTHENTICATE.DYNAMIC_AUTHENTICATION_TEMPLATE_TAG,
          Buffer.concat([
            constructTlv(GENERAL_AUTHENTICATE.CHALLENGE_TAG, challengeHash),
            constructTlv(GENERAL_AUTHENTICATE.RESPONSE_TAG, Buffer.from([])),
          ])
        ),
      })
    );
    const challengeSignature = generalAuthenticateResponse.subarray(4); // Trim metadata

    // Use the public key in the provided cert to verify the generated signature
    const certPublicKey = await openssl([
      'x509',
      '-noout',
      '-pubkey',
      '-in',
      cert,
    ]);
    await openssl([
      'dgst',
      '-verify',
      certPublicKey,
      '-sha256',
      '-signature',
      challengeSignature,
      Buffer.from(challenge, 'utf-8'),
    ]); // Throws if the signature verification fails
  }

  private async parseUserDataFromCert(cert: Buffer): Promise<Optional<User>> {
    const { component, jurisdiction, cardType, electionHash } =
      await this.parseCert(cert);
    assert(component === 'card');
    assert(jurisdiction === this.jurisdiction);
    assert(cardType !== undefined);

    switch (cardType) {
      case 'sa': {
        return { role: 'system_administrator' };
      }
      case 'em': {
        assert(electionHash !== undefined);
        return { role: 'election_manager', electionHash };
      }
      case 'pw': {
        assert(electionHash !== undefined);
        return { role: 'poll_worker', electionHash };
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(cardType);
      }
    }
  }

  private async parseCert(cert: Buffer): Promise<VxCustomCertFields> {
    const response = await openssl(['x509', '-noout', '-subject', '-in', cert]);

    const responseString = response.toString();
    assert(responseString.startsWith('subject='));
    const certSubject = responseString.replace('subject=', '').trimEnd();
    const certFieldsList = certSubject
      .split(',')
      .map((field) => field.trimStart());
    const certFields: { [fieldName: string]: string } = {};
    for (const certField of certFieldsList) {
      const [fieldName, fieldValue] = certField.split(' = ');
      if (fieldName && fieldValue) {
        certFields[fieldName] = fieldValue;
      }
    }

    const customCertFields = VxCustomCertFieldsSchema.parse({
      component: certFields[VX_CUSTOM_CERT_FIELD.COMPONENT],
      jurisdiction: certFields[VX_CUSTOM_CERT_FIELD.JURISDICTION],
      cardType: certFields[VX_CUSTOM_CERT_FIELD.CARD_TYPE],
      electionHash: certFields[VX_CUSTOM_CERT_FIELD.ELECTION_HASH],
    });

    return customCertFields;
  }
}
