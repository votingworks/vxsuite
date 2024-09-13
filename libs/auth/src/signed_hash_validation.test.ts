import { getTestFilePath } from '../test/utils';
import { SignedHashValidationConfig } from './config';
import {
  generateSignedHashValidationQrCodeValue,
  SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR,
  SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR,
} from './signed_hash_validation';

const softwareVersion = 'software-version';
const machineId = 'machine-id';
const electionRecord = {
  electionDefinition: { ballotHash: 'ballot-hash' },
  electionPackageHash: 'election-package-hash',
} as const;

const vxAdminTestConfig: SignedHashValidationConfig = {
  machineCertPath: getTestFilePath({
    fileType: 'vx-admin-cert-authority-cert.pem',
  }),
  machinePrivateKey: {
    source: 'file',
    path: getTestFilePath({ fileType: 'vx-admin-private-key.pem' }),
  },
};

const vxScanTestConfig: SignedHashValidationConfig = {
  machineCertPath: getTestFilePath({
    fileType: 'vx-scan-cert.pem',
  }),
  machinePrivateKey: {
    source: 'file',
    path: getTestFilePath({ fileType: 'vx-scan-private-key.pem' }),
  },
};

test.each<{
  config: SignedHashValidationConfig;
  isMachineConfiguredForAnElection: boolean;
  expectedQrCodeValueLength: number;
}>([
  {
    config: vxAdminTestConfig,
    isMachineConfiguredForAnElection: true,
    expectedQrCodeValueLength: 893,
  },
  {
    config: vxAdminTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 878,
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: true,
    expectedQrCodeValueLength: 730,
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 715,
  },
])(
  'Generating QR code value',
  async ({
    config,
    isMachineConfiguredForAnElection,
    expectedQrCodeValueLength,
  }) => {
    const machineState = {
      electionRecord: isMachineConfiguredForAnElection
        ? electionRecord
        : undefined,
      machineId,
      softwareVersion,
    } as const;
    const { qrCodeValue } = await generateSignedHashValidationQrCodeValue(
      machineState,
      config
    );
    expect([
      expectedQrCodeValueLength,
      // There's a slight chance that the base64-encoded signature within the QR code value is 92
      // characters long instead of 96. (The length of a base64-encoded string is always a multiple
      // of 4.)
      expectedQrCodeValueLength - 4,
    ]).toContain(qrCodeValue.length);
  }
);

test('QR code value and message payload separators cannot be found in a base64 string', () => {
  const base64Characters = [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
    'h',
    'i',
    'j',
    'k',
    'l',
    'm',
    'n',
    'o',
    'p',
    'q',
    'r',
    's',
    't',
    'u',
    'v',
    'w',
    'x',
    'y',
    'z',
    '0',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '/',
    '+',
    '=',
  ];

  expect(
    [...SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR].some(
      (c) => !base64Characters.includes(c)
    )
  ).toEqual(true);
  expect(
    [...SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR].some(
      (c) => !base64Characters.includes(c)
    )
  ).toEqual(true);
});
