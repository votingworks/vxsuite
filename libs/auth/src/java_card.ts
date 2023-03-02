import { Buffer } from 'buffer';
import * as fs from 'fs/promises';
import { sha256 } from 'js-sha256';
import { v4 as uuid } from 'uuid';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  Byte,
  ElectionManagerUser,
  Optional,
  PollWorkerUser,
  SystemAdministratorUser,
  User,
} from '@votingworks/types';

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
import {
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  parseCert,
  parseUserDataFromCert,
} from './certs';
import {
  certDerToPem,
  certPemToDer,
  createCert,
  extractPublicKeyFromCert,
  PUBLIC_KEY_IN_DER_FORMAT_HEADER,
  publicKeyDerToPem,
  verifyFirstCertWasSignedBySecondCert,
  verifySignature,
} from './openssl';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
  GENERAL_AUTHENTICATE,
  GENERATE_ASYMMETRIC_KEY_PAIR,
  GET_DATA,
  isIncorrectPinStatusWord,
  numRemainingAttemptsFromIncorrectPinStatusWord,
  pivDataObjectId,
  PUT_DATA,
  RESET_RETRY_COUNTER,
  VERIFY,
} from './piv';

/**
 * The OpenFIPS201 applet ID
 */
export const OPEN_FIPS_201_AID = 'a000000308000010000100';

/**
 * Java Cards always have a PIN. To allow for "PIN-less" cards and "blank" cards, we use a default
 * PIN.
 */
export const DEFAULT_PIN = '000000';

/**
 * The PIN unblocking key or PUK. Typically a sensitive value but not for us given our modification
 * to OpenFIPS201 to clear all PIN-gated keys on PIN reset, which invalidates the card.
 */
export const PUK = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/**
 * The max number of invalid PIN attempts before the card is completely locked and needs to be
 * reprogrammed. 15 is the max value supported by OpenFIPS201.
 */
export const MAX_INVALID_PIN_ATTEMPTS = 15;

/**
 * The card's VotingWorks-issued cert
 */
export const CARD_VX_CERT = {
  OBJECT_ID: pivDataObjectId(0xf0),
  PRIVATE_KEY_ID: 0xf0,
} as const;

/**
 * The card's VxAdmin-issued cert
 */
export const CARD_VX_ADMIN_CERT = {
  OBJECT_ID: pivDataObjectId(0xf1),
  PRIVATE_KEY_ID: 0xf1,
} as const;

/**
 * The cert authority cert of the VxAdmin that programmed the card
 */
export const VX_ADMIN_CERT_AUTHORITY_CERT = {
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
 * A rough upper bound on the capacity of the card's generic storage space. Though we use 144KB
 * Java Cards, much of that space is consumed by the card OS, the OpenFIPS201 applet, and (to a
 * far lesser degree) our auth keys and certs.
 *
 * Identified this limit through manual testing and intentionally left some breathing room (~10%).
 * Hitting card capacity results in an OS-error status word (0x6f 0x00).
 */
const GENERIC_STORAGE_SPACE_CAPACITY_BYTES = 90000;

/**
 * The card's generic storage space for non-auth data. We use multiple data objects under the hood
 * to increase capacity.
 */
export const GENERIC_STORAGE_SPACE = {
  OBJECT_IDS: [
    pivDataObjectId(0xf3),
    pivDataObjectId(0xf4),
    pivDataObjectId(0xf5),
  ],
} as const;

/**
 * Additional constructor inputs that only VxAdmin needs to provide for card programming
 */
interface CardProgrammingParams {
  vxAdminCertAuthorityCertPath: string;
  vxAdminOpensslConfigPath: string;
  vxAdminPrivateKeyPassword: string;
  vxAdminPrivateKeyPath: string;
}

/**
 * An implementation of the card API that uses a Java Card running our fork of the OpenFIPS201
 * applet (https://github.com/votingworks/openfips201) and X.509 certs. The implementation takes
 * inspiration from the NIST PIV standard but diverges where PIV doesn't suit our needs.
 */
export class JavaCard implements Card {
  private readonly cardProgrammingParams?: CardProgrammingParams;
  private readonly cardReader: CardReader;
  private cardStatus: CardStatus;
  private readonly jurisdiction: string;
  private readonly vxCertAuthorityCertPath: string;

  constructor(input: {
    cardProgrammingParams?: CardProgrammingParams;
    jurisdiction: string;
    vxCertAuthorityCertPath: string;
  }) {
    this.cardProgrammingParams = input.cardProgrammingParams;
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
    await this.selectApplet();

    const cardVxAdminCert = await this.retrieveCert(
      CARD_VX_ADMIN_CERT.OBJECT_ID
    );
    try {
      // Verify that the card has a private key that corresponds to the public key in the card
      // VxAdmin cert
      await this.verifyCardPrivateKey(
        CARD_VX_ADMIN_CERT.PRIVATE_KEY_ID,
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

  async program(
    input:
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string; electionData: string }
      | { user: PollWorkerUser }
  ): Promise<void> {
    assert(this.cardProgrammingParams !== undefined);
    const {
      vxAdminCertAuthorityCertPath,
      vxAdminOpensslConfigPath,
      vxAdminPrivateKeyPassword,
      vxAdminPrivateKeyPath,
    } = this.cardProgrammingParams;
    const pin = 'pin' in input ? input.pin : DEFAULT_PIN;
    await this.selectApplet();

    await this.resetPinAndInvalidateCard(pin);

    const publicKey = await this.generateAsymmetricKeyPair(
      CARD_VX_ADMIN_CERT.PRIVATE_KEY_ID,
      pin
    );
    const cardVxAdminCert = await createCert({
      certSubject: constructCardCertSubject(input.user, this.jurisdiction),
      opensslConfig: vxAdminOpensslConfigPath,
      publicKeyToSign: publicKey,
      signingCertAuthorityCert: vxAdminCertAuthorityCertPath,
      signingPrivateKey: vxAdminPrivateKeyPath,
      signingPrivateKeyPassword: vxAdminPrivateKeyPassword,
    });
    await this.storeCert(CARD_VX_ADMIN_CERT.OBJECT_ID, cardVxAdminCert);

    const vxAdminCertAuthorityCert = await fs.readFile(
      vxAdminCertAuthorityCertPath
    );
    await this.storeCert(
      VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID,
      vxAdminCertAuthorityCert
    );

    if ('electionData' in input) {
      await this.writeData(Buffer.from(input.electionData, 'utf-8'));
    }
  }

  async unprogram(): Promise<void> {
    await this.selectApplet();
    await this.resetPinAndInvalidateCard(DEFAULT_PIN);
    await this.clearCert(CARD_VX_ADMIN_CERT.OBJECT_ID);
    await this.clearCert(VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID);
    await this.clearData();
  }

  async readData(): Promise<Buffer> {
    await this.selectApplet();

    const chunks: Buffer[] = [];
    for (const objectId of GENERIC_STORAGE_SPACE.OBJECT_IDS) {
      let response: Buffer;
      try {
        response = await this.getData(objectId);
      } catch (error) {
        if (
          error instanceof ResponseApduError &&
          error.hasStatusWord([
            STATUS_WORD.FILE_NOT_FOUND.SW1,
            STATUS_WORD.FILE_NOT_FOUND.SW2,
          ])
        ) {
          // OpenFIPS201 treats an empty data object as a non-existent one, so when we clear an
          // object by writing an empty buffer, subsequent retrievals return a file-not-found
          // response instead of a success response with an empty buffer
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
    await this.selectApplet();

    for (const [i, objectId] of GENERIC_STORAGE_SPACE.OBJECT_IDS.entries()) {
      const chunk = data.subarray(
        // When this first number is larger than data.length, the chunk will be empty, and we'll
        // clear the corresponding data object
        MAX_DATA_OBJECT_SIZE_BYTES * i,
        // Okay if this is larger than data.length as .subarray() automatically caps
        MAX_DATA_OBJECT_SIZE_BYTES * i + MAX_DATA_OBJECT_SIZE_BYTES
      );
      await this.putData(
        objectId,
        Buffer.concat([
          constructTlv(PUT_DATA.TAG_LIST_TAG, objectId),
          constructTlv(PUT_DATA.DATA_TAG, chunk),
        ])
      );
    }
  }

  async clearData(): Promise<void> {
    await this.selectApplet();
    await this.writeData(Buffer.from([]));
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
    await verifyFirstCertWasSignedBySecondCert(
      cardVxCert,
      this.vxCertAuthorityCertPath
    );

    // Verify that the card VxAdmin cert was signed by VxAdmin
    const cardVxAdminCert = await this.retrieveCert(
      CARD_VX_ADMIN_CERT.OBJECT_ID
    );
    const vxAdminCertAuthorityCert = await this.retrieveCert(
      VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID
    );
    await verifyFirstCertWasSignedBySecondCert(
      cardVxAdminCert,
      vxAdminCertAuthorityCert
    );

    // Verify that the VxAdmin cert authority cert is 1) a valid VxAdmin cert, 2) for the correct
    // jurisdiction, and 3) signed by VotingWorks
    // TODO: Figure out how to sign the VxAdmin cert authority cert with the VotingWorks cert
    // authority cert
    const vxAdminCertAuthorityCertDetails = await parseCert(
      vxAdminCertAuthorityCert
    );
    assert(vxAdminCertAuthorityCertDetails.component === 'admin');
    assert(vxAdminCertAuthorityCertDetails.jurisdiction === this.jurisdiction);
    await verifyFirstCertWasSignedBySecondCert(
      vxAdminCertAuthorityCert,
      this.vxCertAuthorityCertPath
    );

    // Verify that the card has a private key that corresponds to the public key in the card
    // VotingWorks cert
    await this.verifyCardPrivateKey(CARD_VX_CERT.PRIVATE_KEY_ID, cardVxCert);

    const user = await parseUserDataFromCert(
      cardVxAdminCert,
      this.jurisdiction
    );

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
        CARD_VX_ADMIN_CERT.PRIVATE_KEY_ID,
        cardVxAdminCert,
        DEFAULT_PIN
      );
    }

    return user;
  }

  /**
   * Selects the OpenFIPS201 applet
   */
  private async selectApplet(): Promise<void> {
    await this.cardReader.transmit(
      new CardCommand({
        ins: SELECT.INS,
        p1: SELECT.P1,
        p2: SELECT.P2,
        data: Buffer.from(OPEN_FIPS_201_AID, 'hex'),
      })
    );
  }

  /**
   * Retrieves a cert in PEM format
   */
  private async retrieveCert(certObjectId: Buffer): Promise<Buffer> {
    const getDataResult = await this.getData(certObjectId);
    const certInDerFormat = getDataResult.subarray(8, -5); // Trim metadata
    const certInPemFormat = await certDerToPem(certInDerFormat);
    return certInPemFormat;
  }

  /**
   * Stores a cert. The cert should be in PEM format, but it will be stored in DER format as per
   * PIV standards and Java conventions.
   */
  private async storeCert(
    certObjectId: Buffer,
    certInPemFormat: Buffer
  ): Promise<void> {
    const certInDerFormat = await certPemToDer(certInPemFormat);
    await this.putData(
      certObjectId,
      Buffer.concat([
        constructTlv(PUT_DATA.CERT_TAG, certInDerFormat),
        constructTlv(
          PUT_DATA.CERT_INFO_TAG,
          Buffer.from([PUT_DATA.CERT_INFO_UNCOMPRESSED])
        ),
        constructTlv(PUT_DATA.ERROR_DETECTION_CODE_TAG, Buffer.from([])),
      ])
    );
  }

  private async clearCert(certObjectId: Buffer): Promise<void> {
    await this.putData(certObjectId, Buffer.from([]));
  }

  /**
   * Verifies that the specified card private key corresponds to the public key in the provided
   * cert by 1) having the private key sign a "challenge" and 2) using the public key to verify the
   * generated signature.
   *
   * A PIN must be provided if the private key is PIN-gated.
   */
  private async verifyCardPrivateKey(
    privateKeyId: Byte,
    cert: Buffer,
    pin?: string
  ): Promise<void> {
    if (pin) {
      await this.checkPinInternal(pin);
    }

    // Have the private key sign a "challenge"
    const challenge = `VotingWorks/${new Date().toISOString()}/${uuid()}`;
    const challengeHash = Buffer.from(sha256(challenge), 'hex');
    const generalAuthenticateResponse = await this.cardReader.transmit(
      new CardCommand({
        ins: GENERAL_AUTHENTICATE.INS,
        p1: CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.ECC256,
        p2: privateKeyId,
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

    // Use the cert's public key to verify the generated signature
    const certPublicKey = await extractPublicKeyFromCert(cert);
    await verifySignature({
      publicKey: certPublicKey,
      challengeSignature,
      challenge: Buffer.from(challenge, 'utf-8'),
    });
  }

  /**
   * Generates an asymmetric key pair on the card. The public key is exported, and the private key
   * never leaves the card. The returned public key will be in PEM format.
   *
   * A PIN must be provided if the specified private key is PIN-gated.
   */
  private async generateAsymmetricKeyPair(
    privateKeyId: Byte,
    pin?: string
  ): Promise<Buffer> {
    if (pin) {
      await this.checkPinInternal(pin);
    }

    const generateKeyPairResponse = await this.cardReader.transmit(
      new CardCommand({
        ins: GENERATE_ASYMMETRIC_KEY_PAIR.INS,
        p1: GENERATE_ASYMMETRIC_KEY_PAIR.P1,
        p2: privateKeyId,
        data: constructTlv(
          GENERATE_ASYMMETRIC_KEY_PAIR.CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER_TEMPLATE_TAG,
          constructTlv(
            GENERATE_ASYMMETRIC_KEY_PAIR.CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER_TAG,
            Buffer.from([CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.ECC256])
          )
        ),
      })
    );
    const publicKeyInDerFormat = Buffer.concat([
      PUBLIC_KEY_IN_DER_FORMAT_HEADER,
      generateKeyPairResponse.subarray(5), // Trim metadata
    ]);
    const publicKeyInPemFormat = await publicKeyDerToPem(publicKeyInDerFormat);
    return publicKeyInPemFormat;
  }

  /**
   * The underlying call for checking a PIN. Throws a ResponseApduError with an incorrect-PIN
   * status word if an incorrect PIN is entered. Named checkPinInternal to avoid a conflict with
   * the public checkPin method.
   */
  private async checkPinInternal(pin: string): Promise<void> {
    await this.cardReader.transmit(
      new CardCommand({
        ins: VERIFY.INS,
        p1: VERIFY.P1_VERIFY,
        p2: VERIFY.P2_PIN,
        data: construct8BytePinBuffer(pin),
      })
    );
  }

  /**
   * Resets the card PIN using the PUK and, given our modification to OpenFIPS201, clears all
   * PIN-gated keys.
   *
   * Because the private key associated with the card VxAdmin cert is PIN-gated, this action clears
   * that key. Subsequent auth attempts will fail when we try to verify that the card has a private
   * key that corresponds to the public key in the card VxAdmin cert, and the card will need to be
   * reprogrammed.
   */
  private async resetPinAndInvalidateCard(pin: string): Promise<void> {
    await this.cardReader.transmit(
      new CardCommand({
        ins: RESET_RETRY_COUNTER.INS,
        p1: RESET_RETRY_COUNTER.P1,
        p2: RESET_RETRY_COUNTER.P2,
        data: Buffer.concat([PUK, construct8BytePinBuffer(pin)]),
      })
    );
  }

  private getData(objectId: Buffer): Promise<Buffer> {
    return this.cardReader.transmit(
      new CardCommand({
        ins: GET_DATA.INS,
        p1: GET_DATA.P1,
        p2: GET_DATA.P2,
        data: constructTlv(GET_DATA.TAG_LIST_TAG, objectId),
      })
    );
  }

  private async putData(objectId: Buffer, data: Buffer): Promise<void> {
    await this.cardReader.transmit(
      new CardCommand({
        ins: PUT_DATA.INS,
        p1: PUT_DATA.P1,
        p2: PUT_DATA.P2,
        data: Buffer.concat([
          constructTlv(PUT_DATA.TAG_LIST_TAG, objectId),
          constructTlv(PUT_DATA.DATA_TAG, data),
        ]),
      })
    );
  }

  /**
   * Creates and stores the card's VotingWorks-issued cert. Only to be used by the initial card
   * configuration script.
   */
  async createAndStoreCardVxCert(input: {
    vxOpensslConfigPath: string;
    vxPrivateKeyPassword: string;
    vxPrivateKeyPath: string;
  }): Promise<void> {
    await this.selectApplet();

    const publicKey = await this.generateAsymmetricKeyPair(
      CARD_VX_CERT.PRIVATE_KEY_ID
    );
    const cardVxCert = await createCert({
      certSubject: constructCardCertSubjectWithoutJurisdictionAndCardType(),
      opensslConfig: input.vxOpensslConfigPath,
      publicKeyToSign: publicKey,
      signingCertAuthorityCert: this.vxCertAuthorityCertPath,
      signingPrivateKey: input.vxPrivateKeyPath,
      signingPrivateKeyPassword: input.vxPrivateKeyPassword,
    });
    await this.storeCert(CARD_VX_CERT.OBJECT_ID, cardVxCert);
  }
}
