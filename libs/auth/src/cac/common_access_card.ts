import {
  assert,
  err,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { Byte } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import { sha256 } from 'js-sha256';
import { v4 as uuid } from 'uuid';
import { FileKey, TpmKey } from '../keys';

import {
  CardCommand,
  constructTlv,
  parseTlv,
  parseTlvPartial,
  ResponseApduError,
  SELECT,
} from '../apdu';
import { CardStatus, CheckPinResponse } from '../card';
import { CardReader } from '../card_reader';
import { CERT_EXPIRY_IN_DAYS } from '../certs';
import {
  certDerToPem,
  certPemToDer,
  createCert,
  extractPublicKeyFromCert,
  publicKeyDerToPem,
  verifySignature,
} from '../cryptography';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
  GENERAL_AUTHENTICATE,
  GENERATE_ASYMMETRIC_KEY_PAIR,
  GET_DATA,
  isIncorrectDataFieldParameters,
  isIncorrectPinStatusWord,
  isSecurityConditionNotSatisfiedStatusWord,
  pivDataObjectId,
  PUT_DATA,
  VERIFY,
} from '../piv';
import {
  CommonAccessCardCompatibleCard,
  CommonAccessCardDetails,
  GenerateSignatureError,
} from './common_access_card_api';
import {
  constructCardCertSubject,
  parseCardDetailsFromCert,
} from './common_access_card_certs';

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
 * Default PIN that is used for test CAC cards by DoD
 */
export const DEFAULT_PIN = '77777777';

const SEQUENCE_TAG = 0x30;

/**
 * Builds a command for generating a signature using the specified private key.
 */
export function buildGenerateSignatureCardCommand(
  message: Buffer,
  { privateKeyId }: { privateKeyId: Byte }
): CardCommand {
  const challengeHash = Buffer.from(sha256.arrayBuffer(message));
  assert(challengeHash.byteLength === 32);

  const asn1Sha256MagicValue = Buffer.of(
    0x30,
    0x31,
    0x30,
    0x0d,
    0x06,
    0x09,
    0x60,
    0x86,
    0x48,
    0x01,
    0x65,
    0x03,
    0x04,
    0x02,
    0x01,
    0x05,
    0x00,
    0x04,
    0x20
  );
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
        constructTlv(GENERAL_AUTHENTICATE.RESPONSE_TAG, Buffer.of()),
      ])
    ),
  });
}

interface VerifyCardPrivateKeyError {
  type: 'generate_signature_error';
  error: GenerateSignatureError;
}

function isIncorrectPinError(error: ResponseApduError): boolean {
  return (
    // real CAC cards return 0x6982 for an incorrect PIN
    isSecurityConditionNotSatisfiedStatusWord(error.statusWord()) ||
    // our mock CAC cards return 0x63c? for an incorrect PIN
    isIncorrectPinStatusWord(error.statusWord()) ||
    // our mock CAC cards have a different incorrect PIN status word
    // when the length of the PIN is incorrect
    isIncorrectDataFieldParameters(error.statusWord())
  );
}

/**
 * Supports communication with a Common Access Card.
 */
export class CommonAccessCard implements CommonAccessCardCompatibleCard {
  private readonly cardReader: CardReader;
  private cardStatus: CardStatus<CommonAccessCardDetails | undefined>;
  private readonly customChallengeGenerator?: () => string;
  private readonly certPath?: string;

  constructor({
    customChallengeGenerator,
    certPath,
  }: {
    customChallengeGenerator?: () => string;
    certPath?: string;
  } = {}) {
    this.cardStatus = { status: 'no_card' };
    this.customChallengeGenerator = customChallengeGenerator;
    this.certPath = certPath;

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

  async getCardStatus(): Promise<
    CardStatus<CommonAccessCardDetails | undefined>
  > {
    return Promise.resolve(this.cardStatus);
  }

  async checkPin(pin: string): Promise<CheckPinResponse> {
    await this.selectApplet();

    const cardDodCert = await this.getCertificate({
      objectId: CARD_DOD_CERT.OBJECT_ID,
    });
    const verifyCardPrivateKeyResult = await this.verifyCardPrivateKey(
      CARD_DOD_CERT.PRIVATE_KEY_ID,
      cardDodCert,
      pin
    );

    if (verifyCardPrivateKeyResult.isErr()) {
      const error = verifyCardPrivateKeyResult.err();

      if (error.error.type === 'incorrect_pin') {
        return {
          response: 'incorrect',
          numIncorrectPinAttempts: -1,
        };
      }

      return {
        response: 'error',
        error: error.error.error,
      };
    }

    return { response: 'correct' };
  }

  /**
   * Reads the card details, performing various forms of verification along the way. Throws an
   * error if any verification fails (this includes the case that the card is simply unprogrammed).
   */
  private async readCardDetails(): Promise<
    CommonAccessCardDetails | undefined
  > {
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
  ): Promise<Result<void, VerifyCardPrivateKeyError>> {
    // Have the private key sign a "challenge"
    const challenge = this.generateChallenge();
    const challengeBuffer = Buffer.from(challenge, 'utf-8');
    const generateSignatureResult = await this.generateSignature(
      challengeBuffer,
      {
        privateKeyId,
        pin,
      }
    );

    if (generateSignatureResult.isErr()) {
      return err({
        type: 'generate_signature_error',
        error: generateSignatureResult.err(),
      });
    }

    // Use the cert's public key to verify the generated signature
    const certPublicKey = await extractPublicKeyFromCert(cert);
    await verifySignature({
      message: challengeBuffer,
      messageSignature: generateSignatureResult.ok(),
      publicKey: certPublicKey,
    });

    return ok();
  }

  /**
   * Signs a message using the specified private key. A PIN must be provided if
   * the private key is PIN-gated.
   */
  async generateSignature(
    message: Buffer,
    { privateKeyId, pin }: { privateKeyId: Byte; pin?: string }
  ): Promise<Result<Buffer, GenerateSignatureError>> {
    if (pin) {
      const checkPinResult = await this.checkPinInternal(pin);
      if (checkPinResult.isErr()) {
        const error = checkPinResult.err();

        if (isIncorrectPinError(error)) {
          return err({
            type: 'incorrect_pin',
            error,
            message: 'Incorrect PIN',
          });
        }

        return err({
          type: 'card_error',
          error,
          message: `Card error: ${error.message}`,
        });
      }
    }

    const generalAuthenticateResponse = await this.cardReader.transmit(
      buildGenerateSignatureCardCommand(message, { privateKeyId })
    );

    // see Table 7. Data Objects in the Dynamic Authentication Template (Tag '7C')
    const dynamicAuthenticationTemplate = parseTlv(
      GENERAL_AUTHENTICATE.DYNAMIC_AUTHENTICATION_TEMPLATE_TAG,
      generalAuthenticateResponse
    ).value;

    const signatureResponse = parseTlv(
      GENERAL_AUTHENTICATE.RESPONSE_TAG,
      dynamicAuthenticationTemplate
    ).value;

    return ok(signatureResponse);
  }

  /**
   * Generate a keypair and certify it
   */
  async createAndStoreCert(
    vxPrivateKey: FileKey | TpmKey,
    commonName: string
  ): Promise<void> {
    if (!this.certPath) {
      throw new Error(
        'Cannot create a cert without an authority, which is to be provided in the constructor.'
      );
    }

    await this.selectApplet();

    const publicKey = await this.generateAsymmetricKeyPair(
      CARD_DOD_CERT.PRIVATE_KEY_ID
    );

    const cardVxCert = await createCert({
      certKeyInput: {
        type: 'public',
        key: { source: 'inline', content: publicKey.toString('utf-8') },
      },
      certSubject: constructCardCertSubject(commonName),
      expiryInDays: CERT_EXPIRY_IN_DAYS.CARD_VX_CERT,
      signingCertAuthorityCertPath: this.certPath,
      signingPrivateKey: vxPrivateKey,
    });

    await this.storeCert(CARD_DOD_CERT.OBJECT_ID, cardVxCert);
  }

  /**
   * Retrieves a cert in PEM format.
   */
  async getCertificate(options: { objectId: Buffer }): Promise<Buffer> {
    const data = await this.getData(options.objectId);

    if (data.length === 0) {
      return Buffer.of();
    }

    const [{ value: certInDerFormat }, certInDerFormatRemainder] =
      parseTlvPartial(PUT_DATA.CERT_TAG, data);
    const [{ value: certInfo }, certInfoRemainder] = parseTlvPartial(
      PUT_DATA.CERT_INFO_TAG,
      certInDerFormatRemainder
    );
    // NOTE: CACs seem to return 0x01 for this. I'm not sure what it means, but
    // it's not compressed.
    assert(
      certInfo[0] === PUT_DATA.CERT_INFO_UNCOMPRESSED,
      'Expected cert info to be uncompressed'
    );
    const certErrorDetectionCode = parseTlv(
      PUT_DATA.ERROR_DETECTION_CODE_TAG,
      certInfoRemainder
    ).value;
    assert(
      certErrorDetectionCode.length === 0,
      'Expected no error detection code'
    );
    return await certDerToPem(certInDerFormat);
  }

  /**
   * The underlying call for checking a PIN.
   */
  private async checkPinInternal(
    pin: string
  ): Promise<Result<void, ResponseApduError>> {
    try {
      await this.cardReader.transmit(
        new CardCommand({
          ins: VERIFY.INS,
          p1: VERIFY.P1_VERIFY,
          p2: VERIFY.P2_PIN,
          data: construct8BytePinBuffer(pin),
        })
      );
      return ok();
    } catch (error) {
      if (error instanceof ResponseApduError) {
        return err(error);
      }
      throw error;
    }
  }

  private async getData(objectId: Buffer): Promise<Buffer> {
    try {
      const dataTlv = await this.cardReader.transmit(
        new CardCommand({
          ins: GET_DATA.INS,
          p1: GET_DATA.P1,
          p2: GET_DATA.P2,
          data: constructTlv(GET_DATA.TAG_LIST_TAG, objectId),
        })
      );
      const { value: data } = parseTlv(PUT_DATA.DATA_TAG, dataTlv);
      return data;
    } catch {
      return Buffer.of();
    }
  }

  /**
   * Generates an asymmetric key pair on the card. The public key is exported, and the private key
   * never leaves the card. The returned public key will be in PEM format.
   *
   * A PIN must be provided if the specified private key is PIN-gated.
   */
  private async generateAsymmetricKeyPair(privateKeyId: Byte): Promise<Buffer> {
    const generateKeyPairResponse = await this.cardReader.transmit(
      new CardCommand({
        ins: GENERATE_ASYMMETRIC_KEY_PAIR.INS,
        p1: GENERATE_ASYMMETRIC_KEY_PAIR.P1,
        p2: privateKeyId,
        data: constructTlv(
          GENERATE_ASYMMETRIC_KEY_PAIR.CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER_TEMPLATE_TAG,
          constructTlv(
            GENERATE_ASYMMETRIC_KEY_PAIR.CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER_TAG,
            Buffer.of(CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.RSA2048)
          )
        ),
      })
    );

    const { value: rsaPublicKey } = parseTlv(
      GENERATE_ASYMMETRIC_KEY_PAIR.RESPONSE_TAG,
      generateKeyPairResponse
    );
    const [{ value: modulusValue }, rsaPublicKeyTlvRemainder] = parseTlvPartial(
      GENERATE_ASYMMETRIC_KEY_PAIR.RESPONSE_RSA_MODULUS_TAG,
      rsaPublicKey
    );
    const exponentValue = parseTlv(
      GENERATE_ASYMMETRIC_KEY_PAIR.RESPONSE_RSA_EXPONENT_TAG,
      rsaPublicKeyTlvRemainder
    ).value;

    // construct the DER, which is a bunch of TLVs
    const publicKeyInDerFormat = constructTlv(
      SEQUENCE_TAG,
      Buffer.concat([
        constructTlv(
          SEQUENCE_TAG,
          Buffer.concat([
            constructTlv(
              0x06, // OID tag
              Buffer.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01) // OID
            ),
            constructTlv(0x05, Buffer.of()), // a null
          ])
        ),
        constructTlv(
          0x03, // bit string
          Buffer.concat([
            Buffer.of(0x00),
            constructTlv(
              SEQUENCE_TAG,
              Buffer.concat([
                constructTlv(0x02, modulusValue),
                constructTlv(0x02, exponentValue),
              ])
            ),
          ])
        ),
      ])
    );

    return await publicKeyDerToPem(publicKeyInDerFormat);
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
   * Disconnects the card so that it can be reconnected to, through a new instance
   */
  async disconnect(): Promise<void> {
    await this.cardReader.disconnectCard();
  }
}
