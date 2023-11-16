import { assert, throwIllegalValue } from '@votingworks/basics';
import { Byte } from '@votingworks/types';
import { Buffer } from 'buffer';
import { sha256 } from 'js-sha256';
import { v4 as uuid } from 'uuid';

import {
  CardCommand,
  constructTlv,
  parseTlv,
  ResponseApduError,
  SELECT,
} from '../apdu';
import { CardStatus, CheckPinResponse } from '../card';
import { CardReader } from '../card_reader';
import { parseCardDetailsFromCert } from './common_access_card_certs';
import {
  certDerToPem,
  extractPublicKeyFromCert,
  verifySignature,
} from '../cryptography';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
  GENERAL_AUTHENTICATE,
  GET_DATA,
  isIncorrectPinStatusWord,
  isSecurityConditionNotSatisfiedStatusWord,
  pivDataObjectId,
  PUT_DATA,
  VERIFY,
} from '../piv';
import {
  CommonAccessCardCompatibleCard,
  CommonAccessCardDetails,
} from './common_access_card_api';

/**
 * The standard CAC applet ID.
 *
 * @see https://www.eftlab.com/knowledge-base/complete-list-of-application-identifiers-aid
 */
export const COMMON_ACCESS_CARD_AID = 'a000000308000010000100';

/**
 * The card's DoD-issued cert.
 */
export const CARD_DOD_CERT = {
  OBJECT_ID: pivDataObjectId(0x0a),
  PRIVATE_KEY_ID: 0x9c,
} as const;

/**
 * Builds a command for generating a signature using the specified private key.
 */
export function buildGenerateSignatureCardCommand(
  message: Buffer,
  { privateKeyId }: { privateKeyId: Byte }
): CardCommand {
  const challengeHash = Buffer.from(sha256.arrayBuffer(message));
  assert(challengeHash.byteLength === 32);

  const asn1Sha256MagicValue = Buffer.from([
    0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03,
    0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20,
  ]);
  assert(asn1Sha256MagicValue.byteLength === 19);

  const expectedPaddedMessageLength = 256;
  const x0001 = Buffer.of(0x00, 0x01);
  const x00 = Buffer.of(0x00);
  const allFsPadding = Buffer.alloc(
    expectedPaddedMessageLength -
      asn1Sha256MagicValue.byteLength -
      x0001.byteLength -
      x00.byteLength -
      challengeHash.byteLength,
    0xff
  );

  const paddedMessage = Buffer.concat([
    x0001,
    allFsPadding,
    x00,
    asn1Sha256MagicValue,
    challengeHash,
  ]);
  assert(paddedMessage.byteLength === expectedPaddedMessageLength);

  return new CardCommand({
    ins: GENERAL_AUTHENTICATE.INS,
    p1: CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.RSA2048,
    p2: privateKeyId,
    data: constructTlv(
      GENERAL_AUTHENTICATE.DYNAMIC_AUTHENTICATION_TEMPLATE_TAG,

      Buffer.concat([
        constructTlv(GENERAL_AUTHENTICATE.CHALLENGE_TAG, paddedMessage),
        constructTlv(GENERAL_AUTHENTICATE.RESPONSE_TAG, Buffer.from([])),
      ])
    ),
  });
}

/**
 * Supports communication with a Common Access Card.
 */
export class CommonAccessCard implements CommonAccessCardCompatibleCard {
  private readonly cardReader: CardReader;
  private cardStatus: CardStatus<CommonAccessCardDetails>;
  private readonly customChallengeGenerator?: () => string;

  constructor({
    customChallengeGenerator,
  }: { customChallengeGenerator?: () => string } = {}) {
    this.cardStatus = { status: 'no_card' };
    this.customChallengeGenerator = customChallengeGenerator;

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
            const cardDetails = await this.readCardDetails();
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

  private generateChallenge(): string {
    return (
      this.customChallengeGenerator?.() ??
      `VotingWorks/${new Date().toISOString()}/${uuid()}`
    );
  }

  async getCardStatus(): Promise<CardStatus<CommonAccessCardDetails>> {
    return Promise.resolve(this.cardStatus);
  }

  async checkPin(pin: string): Promise<CheckPinResponse> {
    await this.selectApplet();

    const cardDodCert = await this.getCertificate({
      objectId: CARD_DOD_CERT.OBJECT_ID,
    });
    try {
      await this.verifyCardPrivateKey(
        CARD_DOD_CERT.PRIVATE_KEY_ID,
        cardDodCert,
        pin
      );
    } catch (error) {
      if (
        error instanceof ResponseApduError &&
        // real CAC cards return 0x6982 for an incorrect PIN
        (isSecurityConditionNotSatisfiedStatusWord(error.statusWord()) ||
          // our mock CAC cards return 0x63c? for an incorrect PIN
          isIncorrectPinStatusWord(error.statusWord()))
      ) {
        return { response: 'incorrect', numIncorrectPinAttempts: -1 };
      }

      throw error;
    }
    return { response: 'correct' };
  }

  /**
   * Reads the card details, performing various forms of verification along the way. Throws an
   * error if any verification fails (this includes the case that the card is simply unprogrammed).
   */
  private async readCardDetails(): Promise<CommonAccessCardDetails> {
    await this.selectApplet();
    const cert = await this.getCertificate({
      objectId: CARD_DOD_CERT.OBJECT_ID,
    });
    return parseCardDetailsFromCert(cert);
  }

  /**
   * Selects the standard CAC applet on the card.
   */
  private async selectApplet(): Promise<void> {
    await this.cardReader.transmit(
      new CardCommand({
        ins: SELECT.INS,
        p1: SELECT.P1,
        p2: SELECT.P2,
        data: Buffer.from(COMMON_ACCESS_CARD_AID, 'hex'),
      })
    );
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
    // Have the private key sign a "challenge"
    const challenge = this.generateChallenge();
    const challengeBuffer = Buffer.from(challenge, 'utf-8');
    const challengeSignature = await this.generateSignature(challengeBuffer, {
      privateKeyId,
      pin,
    });

    // Use the cert's public key to verify the generated signature
    const certPublicKey = await extractPublicKeyFromCert(cert);
    await verifySignature({
      message: challengeBuffer,
      messageSignature: challengeSignature,
      publicKey: certPublicKey,
    });
  }

  /**
   * Signs a message using the specified private key. A PIN must be provided if
   * the private key is PIN-gated.
   */
  async generateSignature(
    message: Buffer,
    { privateKeyId, pin }: { privateKeyId: Byte; pin?: string }
  ): Promise<Buffer> {
    if (pin) {
      await this.checkPinInternal(pin);
    }

    const generalAuthenticateResponse = await this.cardReader.transmit(
      buildGenerateSignatureCardCommand(message, { privateKeyId })
    );

    // see Table 7. Data Objects in the Dynamic Authentication Template (Tag '7C')
    const [, , dynamicAuthenticationTemplate] = parseTlv(
      GENERAL_AUTHENTICATE.DYNAMIC_AUTHENTICATION_TEMPLATE_TAG,
      generalAuthenticateResponse
    );

    const [, , signatureResponse] = parseTlv(
      GENERAL_AUTHENTICATE.RESPONSE_TAG,
      dynamicAuthenticationTemplate
    );

    return signatureResponse;
  }

  /**
   * Retrieves a cert in PEM format.
   */
  async getCertificate(options: { objectId: Buffer }): Promise<Buffer> {
    const data = await this.getData(options.objectId);
    const certTlv = data.subarray(0, -5); // Trim metadata
    const [, , certInDerFormat] = parseTlv(PUT_DATA.CERT_TAG, certTlv);
    return await certDerToPem(certInDerFormat);
  }

  /**
   * The underlying call for checking a PIN.
   *
   * @throws `ResponseApduError` with a "security condition not satisfied"
   * status word if the PIN is incorrect
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

  private async getData(objectId: Buffer): Promise<Buffer> {
    const dataTlv = await this.cardReader.transmit(
      new CardCommand({
        ins: GET_DATA.INS,
        p1: GET_DATA.P1,
        p2: GET_DATA.P2,
        data: constructTlv(GET_DATA.TAG_LIST_TAG, objectId),
      })
    );
    const [, , data] = parseTlv(PUT_DATA.DATA_TAG, dataTlv);
    return data;
  }

  /**
   * Disconnects the card so that it can be reconnected to, through a new instance
   */
  async disconnect(): Promise<void> {
    await this.cardReader.disconnectCard();
  }
}
