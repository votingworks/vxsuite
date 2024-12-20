import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { assertDefined, err, ok } from '@votingworks/basics';
import { mockOf } from '@votingworks/test-utils';
import { Byte } from '@votingworks/types';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import { join } from 'node:path';
import waitForExpect from 'wait-for-expect';
import { MockCardReader, getTestFilePath } from '../../test/utils';
import {
  CardCommand,
  ResponseApduError,
  SELECT,
  STATUS_WORD,
  constructTlv,
} from '../apdu';
import { CheckPinResponse } from '../card';
import { CardReader } from '../card_reader';
import { certDerToPem, certPemToDer, createCert } from '../cryptography';
import {
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
  GENERATE_ASYMMETRIC_KEY_PAIR,
  GET_DATA,
  PUT_DATA,
  VERIFY,
  construct8BytePinBuffer,
} from '../piv';
import {
  CARD_DOD_CERT,
  COMMON_ACCESS_CARD_AID,
  CommonAccessCard,
  buildGenerateSignatureCardCommand,
} from './common_access_card';

vi.mock('../card_reader');
vi.mock(
  '../cryptography',
  async (importActual): Promise<typeof import('../cryptography')> => ({
    // We use real cryptographic commands in these tests to ensure end-to-end correctness, the one
    // exception being commands for cert creation since two cert creation commands with the exact
    // same inputs won't necessarily generate the same outputs, making assertions difficult
    ...(await importActual<typeof import('../cryptography')>()),
    createCert: vi.fn(),
  })
);

const DEV_CERT_PEM = fs.readFileSync(join(__dirname, './cac-dev-cert.pem'));
const CERTIFYING_PRIVATE_KEY_PATH = join(
  __dirname,
  '../../certs/dev/vx-cert-authority-cert.pem'
);

let mockCardReader: MockCardReader;

beforeEach(() => {
  vi.mocked(CardReader).mockImplementation((...params) => {
    mockCardReader = new MockCardReader(...params);
    return mockCardReader as unknown as CardReader;
  });
  vi.mocked(createCert).mockImplementation(() => Promise.resolve(Buffer.of()));
});

afterEach(() => {
  mockCardReader.transmit.assertComplete();
});

function mockCardAppletSelectionRequest(): void {
  const command = new CardCommand({
    ins: SELECT.INS,
    p1: SELECT.P1,
    p2: SELECT.P2,
    data: Buffer.from(COMMON_ACCESS_CARD_AID, 'hex'),
  });
  const responseData = Buffer.of();
  mockCardReader.transmit.expectCallWith(command).resolves(responseData);
}

function mockCardGetDataRequest(
  objectId: Buffer,
  dataOrError: Buffer | Error
): void {
  const command = new CardCommand({
    ins: GET_DATA.INS,
    p1: GET_DATA.P1,
    p2: GET_DATA.P2,
    data: constructTlv(GET_DATA.TAG_LIST_TAG, objectId),
  });
  if (dataOrError instanceof Error) {
    mockCardReader.transmit.expectCallWith(command).throws(dataOrError);
    return;
  }
  const data = dataOrError;
  const responseData = constructTlv(PUT_DATA.DATA_TAG, data);
  mockCardReader.transmit.expectCallWith(command).resolves(responseData);
}

function mockCardGetCertificateRequest(
  objectId: Buffer,
  derFormatCertOrError: Buffer | Error
): void {
  if (derFormatCertOrError instanceof Error) {
    mockCardGetDataRequest(objectId, derFormatCertOrError);
    return;
  }

  const derFormatCert = derFormatCertOrError;
  const certTlv = constructTlv(PUT_DATA.CERT_TAG, derFormatCert);
  const certTlvWithMetadata = Buffer.concat([
    certTlv,
    Buffer.of(PUT_DATA.CERT_INFO_TAG, 0x01, PUT_DATA.CERT_INFO_UNCOMPRESSED),
    Buffer.of(PUT_DATA.ERROR_DETECTION_CODE_TAG, 0x00),
  ]);
  mockCardGetDataRequest(objectId, certTlvWithMetadata);
}

function mockCardKeyPairGenerationRequest(privateKeyId: Byte): void {
  const command = new CardCommand({
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
  });

  const responseData = Buffer.from(
    '7f4982010981820100822f01a0914eec41ec37a4dd3147594f3097f32a3998d3ce67418b2b3fd11a4229787c7089e7dd7ffad2c453b86a76e9ed3bc344d215cc367acda3c83c646759569feb5dd31970dc20e28b1067299f59959c77e9ed504e273c52ce99ec440cf310893b9c8e6d63f7a2b80dc0066f87a8a80b29a6c778f44598c3778c5b2e19e159ba3a7c19a47ad67834602bf79312ac928fb95cd41507203b9d59567dcdaebf805263ab731df376d3af2b94174dd279ec33505197e9e7f00af0eb3d91f95b4ae1d70d53c8dbbe8f97a923dad17107245681d3d78eaea0ba3054331dc9c0c564740b34dbf3eac93b325b98da33a3ac1d07b93efb642e7e78b4723146bacba81d8203010001',
    'hex'
  );
  mockCardReader.transmit.expectCallWith(command).resolves(responseData);
}

function mockCardCertStorageRequest(
  certObjectId: Buffer,
  certPath: string
): void {
  const command = new CardCommand({
    ins: PUT_DATA.INS,
    p1: PUT_DATA.P1,
    p2: PUT_DATA.P2,
    data: Buffer.concat([
      constructTlv(PUT_DATA.TAG_LIST_TAG, certObjectId),
      constructTlv(
        PUT_DATA.DATA_TAG,
        Buffer.concat([
          constructTlv(PUT_DATA.CERT_TAG, fs.readFileSync(certPath)),
          constructTlv(
            PUT_DATA.CERT_INFO_TAG,
            Buffer.of(PUT_DATA.CERT_INFO_UNCOMPRESSED)
          ),
          constructTlv(PUT_DATA.ERROR_DETECTION_CODE_TAG, Buffer.of()),
        ])
      ),
    ]),
  });
  const responseData = Buffer.from('9000', 'hex');
  mockCardReader.transmit.expectCallWith(command).resolves(responseData);
}

function mockCardPinVerificationRequest(pin: string, error?: Error): void {
  const command = new CardCommand({
    ins: VERIFY.INS,
    p1: VERIFY.P1_VERIFY,
    p2: VERIFY.P2_PIN,
    data: construct8BytePinBuffer(pin),
  });
  if (error) {
    mockCardReader.transmit.expectCallWith(command).throws(error);
    return;
  }
  const responseData = Buffer.of();
  mockCardReader.transmit.expectCallWith(command).resolves(responseData);
}

function mockCardGenerateSignatureRequest({
  message,
  privateKeyId,
  responseData,
  error,
}: {
  message: Buffer;
  privateKeyId: Byte;
  responseData?: Buffer;
  error?: Error;
}): void {
  const command = buildGenerateSignatureCardCommand(message, { privateKeyId });

  if (error) {
    mockCardReader.transmit.expectCallWith(command).throws(error);
    return;
  }

  mockCardReader.transmit
    .expectCallWith(command)
    .resolves(assertDefined(responseData));
}

test('cardStatus', async () => {
  const cac = new CommonAccessCard();
  mockCardReader.setReaderStatus('no_card_reader');
  expect((await cac.getCardStatus()).status).toEqual('no_card');
  mockCardReader.setReaderStatus('no_card');
  expect((await cac.getCardStatus()).status).toEqual('no_card');
  mockCardReader.setReaderStatus('card_error');
  expect((await cac.getCardStatus()).status).toEqual('card_error');
  mockCardReader.setReaderStatus('unknown_error');
  expect((await cac.getCardStatus()).status).toEqual('unknown_error');

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardReader.setReaderStatus('ready');
  await waitForExpect(async () => {
    expect((await cac.getCardStatus()).status).toEqual('ready');
  });

  // remove the cert and make sure we are back to ready
  mockCardReader.setReaderStatus('no_card');
  expect((await cac.getCardStatus()).status).toEqual('no_card');

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(CARD_DOD_CERT.OBJECT_ID, new Error('no cert'));

  mockCardReader.setReaderStatus('ready');
  await waitForExpect(async () => {
    expect((await cac.getCardStatus()).status).toEqual('ready');
  });
});

test('checkPin: success', async () => {
  // hardcode the challenge so that we can use a real signature
  const challenge =
    'VotingWorks/2023-10-10T21:10:22.225Z/f3667bb5-9692-43be-8d2d-52934c2a15e4';
  const cac = new CommonAccessCard({
    customChallengeGenerator: () => challenge,
  });

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardPinVerificationRequest('1234');
  mockCardGenerateSignatureRequest({
    message: Buffer.from(challenge),
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    // This is the signature of the challenge, signed with the private key corresponding to the
    // cert we mocked above. We use a real signature here to ensure end-to-end correctness.
    // This was taken from the communication with a real (dev) CAC.
    responseData: Buffer.from(
      '7c820104828201009111311d7c17de05e2b1f5c9f3634c272f979dbbd87b6c6a7458838e9b4b2f7219780f6adabbdf3be8b37bef7579dc80422757851faf0a82b6ffb259ded82cc2d0a7e26df671173d3efa04a407d9d35f944e4a5b8f926e4ad7d6cf3f74671636a6cfbd15aec2700eeefa6f27936762e0c25d2f53954514a7cd228074ffc0dd9fa3eac823e5db00735d96c9b20a2b7c84b1c1540f90f4ad22cefa5ae82d528773f77cb9c4e12a42a2c959cfbb01c42cbb630f9a1e11c3860eed8bd2536c02e3c1cc748ba120dee38e2d29b466d1f2330bcaf74041fca3f6b61ef5c9daa9e39d7dce6f83571f79103fd67a9dce1e3fb2c4b424c7b8d5dcc84e6f2add4dae932bc4',
      'hex'
    ),
  });
  expect(await cac.checkPin('1234')).toEqual<CheckPinResponse>({
    response: 'correct',
  });
});

test('checkPin: failure', async () => {
  const cac = new CommonAccessCard();

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardPinVerificationRequest('1234', new ResponseApduError([0x69, 0x82]));
  expect(await cac.checkPin('1234')).toEqual<CheckPinResponse>({
    response: 'incorrect',
    numIncorrectPinAttempts: -1,
  });
});

test('checkPin: failure with incorrect pin status word', async () => {
  const cac = new CommonAccessCard();

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardPinVerificationRequest('1234', new ResponseApduError([0x63, 0xc1]));
  expect(await cac.checkPin('1234')).toEqual<CheckPinResponse>({
    response: 'incorrect',
    numIncorrectPinAttempts: -1,
  });
});

test('checkPin: failure with card error', async () => {
  const cac = new CommonAccessCard();

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardPinVerificationRequest('1234', new ResponseApduError([0x6f, 0x00]));
  expect(await cac.checkPin('1234')).toEqual<CheckPinResponse>({
    response: 'error',
    error: new ResponseApduError([0x6f, 0x00]),
  });
});

test('checkPin: unexpected error', async () => {
  const cac = new CommonAccessCard();

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardPinVerificationRequest('1234', new Error('unexpected error'));
  await expect(cac.checkPin('1234')).rejects.toThrow('unexpected error');
});

test('generateSignature: success with PIN', async () => {
  // hardcode the challenge so that we can use a real signature
  const challenge =
    'VotingWorks/2023-10-10T21:10:22.225Z/f3667bb5-9692-43be-8d2d-52934c2a15e4';
  const cac = new CommonAccessCard({
    customChallengeGenerator: () => challenge,
  });

  mockCardPinVerificationRequest('1234');
  mockCardGenerateSignatureRequest({
    message: Buffer.from(challenge),
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    // This is the signature of the challenge, signed with the private key corresponding to the
    // cert we mocked above. We use a real signature here to ensure end-to-end correctness.
    // This was taken from the communication with a real (dev) CAC.
    responseData: Buffer.from(
      '7c820104828201009111311d7c17de05e2b1f5c9f3634c272f979dbbd87b6c6a7458838e9b4b2f7219780f6adabbdf3be8b37bef7579dc80422757851faf0a82b6ffb259ded82cc2d0a7e26df671173d3efa04a407d9d35f944e4a5b8f926e4ad7d6cf3f74671636a6cfbd15aec2700eeefa6f27936762e0c25d2f53954514a7cd228074ffc0dd9fa3eac823e5db00735d96c9b20a2b7c84b1c1540f90f4ad22cefa5ae82d528773f77cb9c4e12a42a2c959cfbb01c42cbb630f9a1e11c3860eed8bd2536c02e3c1cc748ba120dee38e2d29b466d1f2330bcaf74041fca3f6b61ef5c9daa9e39d7dce6f83571f79103fd67a9dce1e3fb2c4b424c7b8d5dcc84e6f2add4dae932bc4',
      'hex'
    ),
  });
  const result = await cac.generateSignature(Buffer.from(challenge), {
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    pin: '1234',
  });
  expect(result).toEqual(
    ok(
      Buffer.from(
        '9111311d7c17de05e2b1f5c9f3634c272f979dbbd87b6c6a7458838e9b4b2f7219780f6adabbdf3be8b37bef7579dc80422757851faf0a82b6ffb259ded82cc2d0a7e26df671173d3efa04a407d9d35f944e4a5b8f926e4ad7d6cf3f74671636a6cfbd15aec2700eeefa6f27936762e0c25d2f53954514a7cd228074ffc0dd9fa3eac823e5db00735d96c9b20a2b7c84b1c1540f90f4ad22cefa5ae82d528773f77cb9c4e12a42a2c959cfbb01c42cbb630f9a1e11c3860eed8bd2536c02e3c1cc748ba120dee38e2d29b466d1f2330bcaf74041fca3f6b61ef5c9daa9e39d7dce6f83571f79103fd67a9dce1e3fb2c4b424c7b8d5dcc84e6f2add4dae932bc4',
        'hex'
      )
    )
  );
});

test('generateSignature: success without PIN', async () => {
  // hardcode the challenge so that we can use a real signature
  const challenge =
    'VotingWorks/2023-10-10T21:10:22.225Z/f3667bb5-9692-43be-8d2d-52934c2a15e4';
  const cac = new CommonAccessCard({
    customChallengeGenerator: () => challenge,
  });

  mockCardGenerateSignatureRequest({
    message: Buffer.from(challenge),
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    // This is the signature of the challenge, signed with the private key corresponding to the
    // cert we mocked above. We use a real signature here to ensure end-to-end correctness.
    // This was taken from the communication with a real (dev) CAC.
    responseData: Buffer.from(
      '7c820104828201009111311d7c17de05e2b1f5c9f3634c272f979dbbd87b6c6a7458838e9b4b2f7219780f6adabbdf3be8b37bef7579dc80422757851faf0a82b6ffb259ded82cc2d0a7e26df671173d3efa04a407d9d35f944e4a5b8f926e4ad7d6cf3f74671636a6cfbd15aec2700eeefa6f27936762e0c25d2f53954514a7cd228074ffc0dd9fa3eac823e5db00735d96c9b20a2b7c84b1c1540f90f4ad22cefa5ae82d528773f77cb9c4e12a42a2c959cfbb01c42cbb630f9a1e11c3860eed8bd2536c02e3c1cc748ba120dee38e2d29b466d1f2330bcaf74041fca3f6b61ef5c9daa9e39d7dce6f83571f79103fd67a9dce1e3fb2c4b424c7b8d5dcc84e6f2add4dae932bc4',
      'hex'
    ),
  });
  const result = await cac.generateSignature(Buffer.from(challenge), {
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
  });
  expect(result).toEqual(
    ok(
      Buffer.from(
        '9111311d7c17de05e2b1f5c9f3634c272f979dbbd87b6c6a7458838e9b4b2f7219780f6adabbdf3be8b37bef7579dc80422757851faf0a82b6ffb259ded82cc2d0a7e26df671173d3efa04a407d9d35f944e4a5b8f926e4ad7d6cf3f74671636a6cfbd15aec2700eeefa6f27936762e0c25d2f53954514a7cd228074ffc0dd9fa3eac823e5db00735d96c9b20a2b7c84b1c1540f90f4ad22cefa5ae82d528773f77cb9c4e12a42a2c959cfbb01c42cbb630f9a1e11c3860eed8bd2536c02e3c1cc748ba120dee38e2d29b466d1f2330bcaf74041fca3f6b61ef5c9daa9e39d7dce6f83571f79103fd67a9dce1e3fb2c4b424c7b8d5dcc84e6f2add4dae932bc4',
        'hex'
      )
    )
  );
});

test('generateSignature: incorrect PIN (security condition not satisfied response)', async () => {
  // hardcode the challenge so that we can use a real signature
  const challenge =
    'VotingWorks/2023-10-10T21:10:22.225Z/f3667bb5-9692-43be-8d2d-52934c2a15e4';
  const cac = new CommonAccessCard({
    customChallengeGenerator: () => challenge,
  });

  const error = new ResponseApduError([0x69, 0x82]);
  mockCardPinVerificationRequest('1234', error);
  const result = await cac.generateSignature(Buffer.from(challenge), {
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    pin: '1234',
  });
  expect(result).toEqual(
    err({
      type: 'incorrect_pin',
      error,
      message: 'Incorrect PIN',
    })
  );
});

test('generateSignature: incorrect PIN (wrong PIN response)', async () => {
  // hardcode the challenge so that we can use a real signature
  const cac = new CommonAccessCard();

  const error = new ResponseApduError([STATUS_WORD.VERIFY_FAIL.SW1, 0xc0]);
  mockCardPinVerificationRequest('1234', error);
  const result = await cac.generateSignature(Buffer.of(), {
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    pin: '1234',
  });
  expect(result).toEqual(
    err({
      type: 'incorrect_pin',
      error,
      message: 'Incorrect PIN',
    })
  );
});

test('generateSignature: incorrect PIN (incorrect data field parameters response)', async () => {
  const cac = new CommonAccessCard();

  const error = new ResponseApduError([
    STATUS_WORD.INCORRECT_DATA_FIELD_PARAMETERS.SW1,
    STATUS_WORD.INCORRECT_DATA_FIELD_PARAMETERS.SW2,
  ]);
  mockCardPinVerificationRequest('1234', error);
  const result = await cac.generateSignature(Buffer.of(), {
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    pin: '1234',
  });
  expect(result).toEqual(
    err({
      type: 'incorrect_pin',
      error,
      message: 'Incorrect PIN',
    })
  );
});

test('generateSignature: card error', async () => {
  const cac = new CommonAccessCard();

  const error = new ResponseApduError([0x6f, 0x00]);
  mockCardPinVerificationRequest('1234', error);
  const result = await cac.generateSignature(Buffer.of(), {
    privateKeyId: CARD_DOD_CERT.PRIVATE_KEY_ID,
    pin: '1234',
  });
  expect(result).toEqual(
    err({
      type: 'card_error',
      error,
      message:
        'Card error: Received response APDU with error status word: 6f 00',
    })
  );
});

test('create and store cert', async () => {
  // this is a bogus cert but it doesn't matter as the cert is not verified at this stage
  const certPath = getTestFilePath({
    fileType: 'card-vx-cert.der',
    cardType: 'system-administrator',
  });
  mockOf(createCert).mockImplementationOnce(() =>
    certDerToPem(fs.readFileSync(certPath))
  );

  const cac = new CommonAccessCard({ certPath });

  mockCardAppletSelectionRequest();
  mockCardKeyPairGenerationRequest(CARD_DOD_CERT.PRIVATE_KEY_ID);
  mockCardCertStorageRequest(CARD_DOD_CERT.OBJECT_ID, certPath);

  await cac.createAndStoreCert(
    {
      source: 'file',
      path: CERTIFYING_PRIVATE_KEY_PATH,
    },
    'SMITH.FRED.12345'
  );

  expect(createCert).toHaveBeenCalledTimes(1);
});

test('throws error when attempting to create a cert without a signing authority', async () => {
  const cac = new CommonAccessCard();
  await expect(async () => {
    await cac.createAndStoreCert(
      {
        source: 'file',
        path: CERTIFYING_PRIVATE_KEY_PATH,
      },
      'SMITH.FRED.12345'
    );
  }).rejects.toThrow();
});

test('disconnect', async () => {
  const cac = new CommonAccessCard();
  mockCardReader.disconnectCard.expectCallWith().resolves();
  await cac.disconnect();
});
