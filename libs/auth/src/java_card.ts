import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import { sha256 } from 'js-sha256';
import { v4 as uuid } from 'uuid';
import {
  assert,
  extractErrorMessage,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  Byte,
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  VendorUser,
} from '@votingworks/types';

import {
  CardCommand,
  constructTlv,
  parseTlv,
  parseTlvPartial,
  ResponseApduError,
  SELECT,
  STATUS_WORD,
} from './apdu';
import {
  arePollWorkerCardDetails,
  Card,
  CardDetails,
  CardStatus,
  CheckPinResponse,
  ProgrammedCardDetails,
} from './card';
import { CardReader } from './card_reader';
import {
  CERT_EXPIRY_IN_DAYS,
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  parseCardDetailsFromCert,
  parseMachineDetailsFromCert,
} from './certs';
import {
  CardProgrammingConfig,
  constructJavaCardConfig,
  JavaCardConfig,
} from './config';
import {
  certDerToPem,
  certPemToDer,
  createCert,
  CreateCertInput,
  extractPublicKeyFromCert,
  PUBLIC_KEY_IN_DER_FORMAT_HEADER,
  publicKeyDerToPem,
  verifyFirstCertWasSignedBySecondCert,
  verifySignature,
} from './cryptography';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
  GENERAL_AUTHENTICATE,
  GENERATE_ASYMMETRIC_KEY_PAIR,
  GET_DATA,
  isIncorrectPinStatusWord,
  numRemainingPinAttemptsFromIncorrectPinStatusWord,
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
export const PUK = Buffer.of(0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);

/**
 * The max number of incorrect PIN attempts before the card is completely locked and needs to be
 * reprogrammed. 15 is the max value supported by OpenFIPS201.
 */
export const MAX_NUM_INCORRECT_PIN_ATTEMPTS = 15;

/**
 * This cert is issued by VotingWorks during initial Java Card configuration. The cert indicates
 * that the card is an authentic VotingWorks card.
 */
export const CARD_VX_CERT = {
  OBJECT_ID: pivDataObjectId(0xf0),
  PRIVATE_KEY_ID: 0xf0,
} as const;

/**
 * This cert is issued during card programming, by VotingWorks directly for vendor cards and by
 * VxAdmin for all other cards. The cert indicates the card's identity, i.e, user role,
 * jurisdiction, election key, etc.
 */
export const CARD_IDENTITY_CERT = {
  OBJECT_ID: pivDataObjectId(0xf1),
  PRIVATE_KEY_ID: 0xf1,
} as const;

/**
 * The cert authority cert of the VxAdmin that programmed the card. Not relevant for vendor cards.
 */
export const VX_ADMIN_CERT_AUTHORITY_CERT = {
  OBJECT_ID: pivDataObjectId(0xf2),
} as const;

/**
 * An upper bound on the size of a single data object. Though a TLV value can be up to 65,535 bytes
 * long (0xffff in hex), OpenFIPS201 caps total TLV length (including tag and length) at 32,767
 * bytes (0x7fff in hex). This allows for a max data object size of:
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
export const GENERIC_STORAGE_SPACE_CAPACITY_BYTES = 90000;

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
 * An implementation of the card API that uses a Java Card running our fork of the OpenFIPS201
 * applet (https://github.com/votingworks/openfips201) and X.509 certs. The implementation takes
 * inspiration from the NIST PIV standard but diverges where PIV doesn't suit our needs.
 */
export class JavaCard implements Card {
  private readonly cardProgrammingConfig?: CardProgrammingConfig;
  private readonly cardReader: CardReader;
  // See TestJavaCard in test/utils.ts to understand why this is protected instead of private
  protected cardStatus: CardStatus;
  private readonly generateChallenge: () => string;
  private readonly vxCertAuthorityCertPath: string;

  constructor(
    // Support specifying a custom config for tests
    /* istanbul ignore next */
    input: JavaCardConfig = constructJavaCardConfig()
  ) {
    this.cardProgrammingConfig = input.cardProgrammingConfig;
    this.cardStatus = { status: 'no_card_reader' };
    this.generateChallenge =
      input.generateChallengeOverride ??
      /* istanbul ignore next */ (() =>
        `VotingWorks/${new Date().toISOString()}/${uuid()}`);
    this.vxCertAuthorityCertPath = input.vxCertAuthorityCertPath;

    this.cardReader = new CardReader({
      onReaderStatusChange: async (readerStatus) => {
        switch (readerStatus) {
          case 'no_card_reader': {
            this.cardStatus = { status: 'no_card_reader' };
            return;
          }
          case 'no_card': {
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
            const cardDetails = await this.safeReadCardDetails();
            this.cardStatus = { status: 'ready', cardDetails };
            return;
          }
          /* istanbul ignore next: Compile-time check for completeness */
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

    const cardIdentityCert = await this.retrieveCert(
      CARD_IDENTITY_CERT.OBJECT_ID
    );
    try {
      // Verify that the card has a private key that corresponds to the public key in the card
      // identity cert
      await this.verifyCardPrivateKey(
        CARD_IDENTITY_CERT.PRIVATE_KEY_ID,
        cardIdentityCert,
        pin
      );
    } catch (error) {
      if (
        error instanceof ResponseApduError &&
        isIncorrectPinStatusWord(error.statusWord())
      ) {
        const numIncorrectPinAttempts =
          MAX_NUM_INCORRECT_PIN_ATTEMPTS -
          numRemainingPinAttemptsFromIncorrectPinStatusWord(error.statusWord());
        if (
          this.cardStatus.status === 'ready' &&
          this.cardStatus.cardDetails.user
        ) {
          this.cardStatus = {
            status: 'ready',
            cardDetails: {
              ...this.cardStatus.cardDetails,
              numIncorrectPinAttempts,
            },
          };
        }
        return {
          response: 'incorrect',
          numIncorrectPinAttempts,
        };
      }
      throw error;
    }
    if (
      this.cardStatus.status === 'ready' &&
      this.cardStatus.cardDetails.user
    ) {
      this.cardStatus = {
        status: 'ready',
        cardDetails: {
          ...this.cardStatus.cardDetails,
          numIncorrectPinAttempts: undefined,
        },
      };
    }
    return { response: 'correct' };
  }

  async program(
    input:
      | { user: VendorUser; pin: string }
      | { user: SystemAdministratorUser; pin: string }
      | { user: ElectionManagerUser; pin: string }
      | { user: PollWorkerUser; pin?: string }
  ): Promise<void> {
    assert(
      this.cardProgrammingConfig !== undefined,
      'cardProgrammingConfig must be defined'
    );
    const { user } = input;
    const hasPin = input.pin !== undefined;
    const pin = input.pin ?? DEFAULT_PIN;
    await this.selectApplet();

    await this.resetPinAndInvalidateCard(pin);

    const publicKey = await this.generateAsymmetricKeyPair(
      CARD_IDENTITY_CERT.PRIVATE_KEY_ID,
      pin
    );
    let cardDetails: CardDetails;
    switch (user.role) {
      case 'vendor': {
        cardDetails = { user };
        break;
      }
      case 'system_administrator': {
        cardDetails = { user };
        break;
      }
      case 'election_manager': {
        cardDetails = { user };
        break;
      }
      case 'poll_worker': {
        cardDetails = { user, hasPin };
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(user, 'role');
      }
    }
    const createCertInputBase: Pick<
      CreateCertInput,
      'certKeyInput' | 'certSubject'
    > = {
      certKeyInput: {
        type: 'public',
        key: { source: 'inline', content: publicKey.toString('utf-8') },
      },
      certSubject: constructCardCertSubject(cardDetails),
    };

    if (user.role === 'vendor') {
      assert(this.cardProgrammingConfig.configType === 'vx');
      const { vxPrivateKey } = this.cardProgrammingConfig;

      // Store card identity cert
      const cardIdentityCert = await createCert({
        ...createCertInputBase,
        expiryInDays: CERT_EXPIRY_IN_DAYS.VENDOR_CARD_IDENTITY_CERT,
        signingCertAuthorityCertPath: this.vxCertAuthorityCertPath,
        signingPrivateKey: vxPrivateKey,
      });
      await this.storeCert(CARD_IDENTITY_CERT.OBJECT_ID, cardIdentityCert);
    } else {
      assert(this.cardProgrammingConfig.configType === 'vx_admin');
      const { vxAdminCertAuthorityCertPath, vxAdminPrivateKey } =
        this.cardProgrammingConfig;

      // Store card identity cert
      const cardIdentityCert = await createCert({
        ...createCertInputBase,
        expiryInDays:
          user.role === 'system_administrator'
            ? CERT_EXPIRY_IN_DAYS.SYSTEM_ADMINISTRATOR_CARD_IDENTITY_CERT
            : CERT_EXPIRY_IN_DAYS.ELECTION_CARD_IDENTITY_CERT,
        signingCertAuthorityCertPath: vxAdminCertAuthorityCertPath,
        signingPrivateKey: vxAdminPrivateKey,
      });
      await this.storeCert(CARD_IDENTITY_CERT.OBJECT_ID, cardIdentityCert);

      // Store VxAdmin cert authority cert
      const vxAdminCertAuthorityCert = await fs.readFile(
        vxAdminCertAuthorityCertPath
      );
      const vxAdminCertAuthorityCertDetails = await parseMachineDetailsFromCert(
        vxAdminCertAuthorityCert
      );
      assert(vxAdminCertAuthorityCertDetails.machineType === 'admin');
      assert(
        user.jurisdiction === vxAdminCertAuthorityCertDetails.jurisdiction
      );
      await this.storeCert(
        VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID,
        vxAdminCertAuthorityCert
      );
    }

    this.cardStatus = { status: 'ready', cardDetails };
  }

  async unprogram(): Promise<void> {
    assert(
      this.cardProgrammingConfig !== undefined,
      'cardProgrammingConfig must be defined'
    );
    await this.selectApplet();
    await this.resetPinAndInvalidateCard(DEFAULT_PIN);
    await this.clearCert(CARD_IDENTITY_CERT.OBJECT_ID);
    await this.clearCert(VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID);
    await this.clearData();
    this.cardStatus = {
      status: 'ready',
      cardDetails: {
        user: undefined,
        reason: 'unprogrammed_or_invalid_card',
      },
    };
  }

  async readData(): Promise<Buffer> {
    await this.selectApplet();

    const chunks: Buffer[] = [];
    for (const objectId of GENERIC_STORAGE_SPACE.OBJECT_IDS) {
      let chunk: Buffer;
      try {
        chunk = await this.getData(objectId);
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
          chunks.push(Buffer.of());
          continue;
        }
        throw error;
      }
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
      await this.putData(objectId, chunk);
    }
  }

  async clearData(): Promise<void> {
    // No need to explicitly call this.selectApplet here since this.writeData does so internally
    await this.writeData(Buffer.of());
  }

  /**
   * We wrap readCardDetails to create safeReadCardDetails because readCardDetails:
   * 1. Intentionally throws errors if any verification fails
   * 2. Can throw errors due to external actions like preemptively removing the card from the card
   *    reader
   *
   * This wrapper should never throw errors.
   */
  private async safeReadCardDetails(): Promise<CardDetails> {
    try {
      return await this.readCardDetails();
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      const reason = (() => {
        if (errorMessage.includes('certificate has expired')) {
          return 'certificate_expired';
        }
        /* istanbul ignore next: It's hard to create test certs with start dates in the future
           given our current code. */
        // This typically indicates that machines' clocks have fallen out of sync, e.g., a VxScan
        // has a time before the time on the VxAdmin when the card was programmed.
        if (errorMessage.includes('certificate is not yet valid')) {
          return 'certificate_not_yet_valid';
        }
        return 'unprogrammed_or_invalid_card';
      })();
      return { user: undefined, reason };
    }
  }

  /**
   * Reads the card details, performing various forms of verification along the way. Throws an
   * error if any verification fails (this includes the case that the card is simply unprogrammed).
   */
  private async readCardDetails(): Promise<ProgrammedCardDetails> {
    await this.selectApplet();

    // Verify that the card VotingWorks cert was signed by VotingWorks
    const cardVxCert = await this.retrieveCert(CARD_VX_CERT.OBJECT_ID);
    await verifyFirstCertWasSignedBySecondCert(
      cardVxCert,
      this.vxCertAuthorityCertPath
    );

    const cardIdentityCert = await this.retrieveCert(
      CARD_IDENTITY_CERT.OBJECT_ID
    );
    const cardDetails = await parseCardDetailsFromCert(cardIdentityCert);

    // Verify the card identity cert, the details of verification being dependent on whether the
    // card is a vendor card or a VxAdmin-programmed card
    if (cardDetails.user.role === 'vendor') {
      // Verify that the card identity cert was signed by VotingWorks
      await verifyFirstCertWasSignedBySecondCert(
        cardIdentityCert,
        this.vxCertAuthorityCertPath
      );
    } else {
      // Verify that the card identity cert was signed by VxAdmin
      const vxAdminCertAuthorityCert = await this.retrieveCert(
        VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID
      );
      await verifyFirstCertWasSignedBySecondCert(
        cardIdentityCert,
        vxAdminCertAuthorityCert
      );

      // Verify that the VxAdmin cert authority cert on the card is a valid VxAdmin cert, signed by
      // VotingWorks
      const vxAdminCertAuthorityCertDetails = await parseMachineDetailsFromCert(
        vxAdminCertAuthorityCert
      );
      assert(vxAdminCertAuthorityCertDetails.machineType === 'admin');
      await verifyFirstCertWasSignedBySecondCert(
        vxAdminCertAuthorityCert,
        this.vxCertAuthorityCertPath
      );

      assert(
        cardDetails.user.jurisdiction ===
          vxAdminCertAuthorityCertDetails.jurisdiction
      );
    }

    // Verify that the card has a private key that corresponds to the public key in the card
    // VotingWorks cert
    await this.verifyCardPrivateKey(CARD_VX_CERT.PRIVATE_KEY_ID, cardVxCert);

    /**
     * If the card doesn't have a PIN:
     * Verify that the card has a private key that corresponds to the public key in the card
     * identity cert
     *
     * If the card does have a PIN:
     * Perform this verification later in checkPin because operations with this private key are
     * PIN-gated
     */
    const cardDoesNotHavePin =
      arePollWorkerCardDetails(cardDetails) && !cardDetails.hasPin;
    if (cardDoesNotHavePin) {
      await this.verifyCardPrivateKey(
        CARD_IDENTITY_CERT.PRIVATE_KEY_ID,
        cardIdentityCert,
        DEFAULT_PIN
      );
    }

    const numIncorrectPinAttempts = cardDoesNotHavePin
      ? undefined
      : (await this.getNumIncorrectPinAttempts()) || undefined;
    return { ...cardDetails, numIncorrectPinAttempts };
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
    const data = await this.getData(certObjectId);
    const [{ value: certInDerFormat }, certInDerFormatRemainder] =
      parseTlvPartial(PUT_DATA.CERT_TAG, data);
    const [{ value: certInfo }, certInfoRemainder] = parseTlvPartial(
      PUT_DATA.CERT_INFO_TAG,
      certInDerFormatRemainder
    );
    assert(
      certInfo[0] === PUT_DATA.CERT_INFO_UNCOMPRESSED,
      'Expected cert info to be uncompressed'
    );
    const { value: certErrorDetectionCode } = parseTlv(
      PUT_DATA.ERROR_DETECTION_CODE_TAG,
      certInfoRemainder
    );
    assert(
      certErrorDetectionCode.length === 0,
      'Expected no error detection code'
    );
    return await certDerToPem(certInDerFormat);
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
          Buffer.of(PUT_DATA.CERT_INFO_UNCOMPRESSED)
        ),
        constructTlv(PUT_DATA.ERROR_DETECTION_CODE_TAG, Buffer.of()),
      ])
    );
  }

  private async clearCert(certObjectId: Buffer): Promise<void> {
    await this.putData(certObjectId, Buffer.of());
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
    const challenge = this.generateChallenge();
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
            constructTlv(GENERAL_AUTHENTICATE.RESPONSE_TAG, Buffer.of()),
          ])
        ),
      })
    );

    const { value: generalAuthenticateDynamicAuthenticationBody } = parseTlv(
      GENERAL_AUTHENTICATE.DYNAMIC_AUTHENTICATION_TEMPLATE_TAG,
      generalAuthenticateResponse
    );

    const { value: challengeSignature } = parseTlv(
      GENERAL_AUTHENTICATE.RESPONSE_TAG,
      generalAuthenticateDynamicAuthenticationBody
    );

    // Use the cert's public key to verify the generated signature
    const certPublicKey = await extractPublicKeyFromCert(cert);
    await verifySignature({
      message: Buffer.from(challenge, 'utf-8'),
      messageSignature: challengeSignature,
      publicKey: certPublicKey,
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
            Buffer.of(CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.ECC256)
          )
        ),
      })
    );

    const { value: publicKeyEccWrapper } = parseTlv(
      GENERATE_ASYMMETRIC_KEY_PAIR.RESPONSE_TAG,
      generateKeyPairResponse
    );

    const { value: publicKeyDerFormatBody } = parseTlv(
      GENERATE_ASYMMETRIC_KEY_PAIR.RESPONSE_ECC_POINT_TAG,
      publicKeyEccWrapper
    );

    const publicKeyInDerFormat = Buffer.concat([
      PUBLIC_KEY_IN_DER_FORMAT_HEADER,
      publicKeyDerFormatBody,
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
   * Gets the number of incorrect PIN attempts since the last successful PIN entry (without
   * spending another attempt). Under the hood, gets the number of remaining PIN attempts and
   * converts from that to the number of incorrect PIN attempts.
   */
  private async getNumIncorrectPinAttempts(): Promise<number> {
    try {
      await this.cardReader.transmit(
        new CardCommand({
          ins: VERIFY.INS,
          p1: VERIFY.P1_VERIFY,
          p2: VERIFY.P2_PIN,
        })
      );
    } catch (error) {
      // The data is returned in what would typically be considered an error
      if (
        error instanceof ResponseApduError &&
        isIncorrectPinStatusWord(error.statusWord())
      ) {
        return (
          MAX_NUM_INCORRECT_PIN_ATTEMPTS -
          numRemainingPinAttemptsFromIncorrectPinStatusWord(error.statusWord())
        );
      }
      throw error;
    }
    /* istanbul ignore next */
    throw new Error('Error retrieving number of incorrect PIN attempts');
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
  private async resetPinAndInvalidateCard(newPin: string): Promise<void> {
    await this.cardReader.transmit(
      new CardCommand({
        ins: RESET_RETRY_COUNTER.INS,
        p1: RESET_RETRY_COUNTER.P1,
        p2: RESET_RETRY_COUNTER.P2,
        data: Buffer.concat([PUK, construct8BytePinBuffer(newPin)]),
      })
    );
  }

  private async getData(objectId: Buffer): Promise<Buffer> {
    const dataTlv = await this.cardReader.transmit(
      new CardCommand({
        ins: GET_DATA.INS,
        p1: GET_DATA.P1,
        p2: GET_DATA.P2,
        data: constructTlv(GET_DATA.TAG_LIST_TAG, objectId),
      })
    );
    const tlv = parseTlv(PUT_DATA.DATA_TAG, dataTlv);
    return tlv.value;
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

  //
  // Methods for scripts
  //

  /**
   * Disconnects the card so that it can be reconnected to, through a new JavaCard instance
   */
  async disconnect(): Promise<void> {
    await this.cardReader.disconnectCard();
  }

  /**
   * Retrieves the specified cert from the card. Used by the card detail reading script.
   */
  async retrieveCertByIdentifier(
    certIdentifier:
      | 'cardVxCert'
      | 'cardIdentityCert'
      | 'vxAdminCertAuthorityCert'
  ): Promise<Buffer> {
    await this.selectApplet();

    const certConfigs = {
      cardVxCert: CARD_VX_CERT,
      cardIdentityCert: CARD_IDENTITY_CERT,
      vxAdminCertAuthorityCert: VX_ADMIN_CERT_AUTHORITY_CERT,
    } as const;
    return await this.retrieveCert(certConfigs[certIdentifier].OBJECT_ID);
  }

  /**
   * Creates and stores the card's VotingWorks-issued cert. Used by the initial card configuration
   * script.
   */
  async createAndStoreCardVxCert(): Promise<void> {
    assert(this.cardProgrammingConfig !== undefined);
    assert(this.cardProgrammingConfig.configType === 'vx');
    await this.selectApplet();

    const publicKey = await this.generateAsymmetricKeyPair(
      CARD_VX_CERT.PRIVATE_KEY_ID
    );
    const cardVxCert = await createCert({
      certKeyInput: {
        type: 'public',
        key: { source: 'inline', content: publicKey.toString('utf-8') },
      },
      certSubject: constructCardCertSubjectWithoutJurisdictionAndCardType(),
      expiryInDays: CERT_EXPIRY_IN_DAYS.CARD_VX_CERT,
      signingCertAuthorityCertPath: this.vxCertAuthorityCertPath,
      signingPrivateKey: this.cardProgrammingConfig.vxPrivateKey,
    });
    await this.storeCert(CARD_VX_CERT.OBJECT_ID, cardVxCert);
  }
}
