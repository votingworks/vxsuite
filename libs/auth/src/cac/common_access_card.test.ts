import { Buffer } from 'buffer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { mockOf } from '@votingworks/test-utils';
import { Byte } from '@votingworks/types';
import { assertDefined, typedAs } from '@votingworks/basics';
import waitForExpect from 'wait-for-expect';
import { certPemToDer, createCert } from '../cryptography';
import { MockCardReader } from '../../test/utils';
import { CardReader } from '../card_reader';
import {
  CARD_DOD_CERT,
  COMMON_ACCESS_CARD_AID,
  CommonAccessCard,
  buildGenerateSignatureCardCommand,
} from './common_access_card';
import { CardCommand, ResponseApduError, SELECT, constructTlv } from '../apdu';
import { GET_DATA, PUT_DATA, VERIFY, construct8BytePinBuffer } from '../piv';
import { CheckPinResponse } from '../card';

jest.mock('../card_reader');
jest.mock('../cryptography', (): typeof import('../cryptography') => ({
  // We use real cryptographic commands in these tests to ensure end-to-end correctness, the one
  // exception being commands for cert creation since two cert creation commands with the exact
  // same inputs won't necessarily generate the same outputs, making assertions difficult
  ...jest.requireActual('../cryptography'),
  createCert: jest.fn(),
}));

const DEV_CERT_PEM = readFileSync(join(__dirname, './cac-dev-cert.pem'));

let mockCardReader: MockCardReader;

beforeEach(() => {
  (CardReader as jest.MockedClass<typeof CardReader>).mockImplementation(
    (...params) => {
      mockCardReader = new MockCardReader(...params);
      return mockCardReader as unknown as CardReader;
    }
  );
  mockOf(createCert).mockImplementation(() => Promise.resolve(Buffer.of()));
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
  expect(await cac.checkPin('1234')).toEqual(
    typedAs<CheckPinResponse>({
      response: 'correct',
    })
  );
});

test('checkPin: failure', async () => {
  const cac = new CommonAccessCard();

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardPinVerificationRequest('1234', new ResponseApduError([0x69, 0x82]));
  expect(await cac.checkPin('1234')).toEqual(
    typedAs<CheckPinResponse>({
      response: 'incorrect',
      numIncorrectPinAttempts: -1,
    })
  );
});

test('checkPin: failure with incorrect pin status word', async () => {
  const cac = new CommonAccessCard();

  mockCardAppletSelectionRequest();
  mockCardGetCertificateRequest(
    CARD_DOD_CERT.OBJECT_ID,
    await certPemToDer(DEV_CERT_PEM)
  );
  mockCardPinVerificationRequest('1234', new ResponseApduError([0x63, 0xc1]));
  expect(await cac.checkPin('1234')).toEqual(
    typedAs<CheckPinResponse>({
      response: 'incorrect',
      numIncorrectPinAttempts: -1,
    })
  );
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

test('disconnect', async () => {
  const cac = new CommonAccessCard();
  mockCardReader.disconnectCard.expectCallWith().resolves();
  await cac.disconnect();
});
