import { expect, test } from 'vitest';
import { DEV_MACHINE_ID, formatElectionHashes } from '@votingworks/types';

import { getTestFilePath } from '../test/utils';
import { SignedHashValidationConfig } from './config';
import {
  generateSignedHashValidationQrCodeValue,
  SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR,
  SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR,
} from './signed_hash_validation';

const softwareVersion = 'software-version';
const electionRecord = {
  electionDefinition: { ballotHash: 'ballot-hash' },
  electionPackageHash: 'election-package-hash',
} as const;
const combinedElectionHash: string = formatElectionHashes(
  electionRecord.electionDefinition.ballotHash,
  electionRecord.electionPackageHash
);

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
  expectedQrCodeInputs: {
    combinedElectionHash: string;
    machineId: string;
  };
}>([
  {
    config: vxAdminTestConfig,
    isMachineConfiguredForAnElection: true,
    expectedQrCodeValueLength: 910,
    expectedQrCodeInputs: {
      combinedElectionHash,
      machineId: DEV_MACHINE_ID,
    },
  },
  {
    config: vxAdminTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 895,
    expectedQrCodeInputs: {
      combinedElectionHash: '',
      machineId: DEV_MACHINE_ID,
    },
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: true,
    expectedQrCodeValueLength: 748,
    expectedQrCodeInputs: {
      combinedElectionHash,
      machineId: DEV_MACHINE_ID,
    },
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 733,
    expectedQrCodeInputs: {
      combinedElectionHash: '',
      machineId: DEV_MACHINE_ID,
    },
  },
])(
  'Generating QR code value',
  async ({
    config,
    isMachineConfiguredForAnElection,
    expectedQrCodeValueLength,
    expectedQrCodeInputs,
  }) => {
    const machineState = {
      electionRecord: isMachineConfiguredForAnElection
        ? electionRecord
        : undefined,
      softwareVersion,
    } as const;

    const { qrCodeValue, qrCodeInputs } =
      await generateSignedHashValidationQrCodeValue(machineState, config);

    expect([
      expectedQrCodeValueLength,
      // There's a slight chance that the base64-encoded signature within the QR code value is 92
      // characters long instead of 96. (The length of a base64-encoded string is always a multiple
      // of 4.)
      expectedQrCodeValueLength - 4,
    ]).toContain(qrCodeValue.length);

    expect(qrCodeInputs).toEqual({
      ...expectedQrCodeInputs,
      date: expect.any(Date),
      softwareVersion,
      systemHash: 'UNVERIFIED==================================',
    });
  }
);

test('QR code value separator and message payload separator cannot be found in signed hash validation content', () => {
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
  const dateCharacters = [...new Date().toISOString()];
  const signedHashValidationContentCharacters = new Set<string>([
    ...base64Characters,
    ...dateCharacters,
  ]);

  function doesStringHaveSomeCharacterNotInSet(
    s: string,
    set: Set<string>
  ): boolean {
    return [...s].some((c) => !set.has(c));
  }

  expect(
    doesStringHaveSomeCharacterNotInSet(
      SIGNED_HASH_VALIDATION_QR_CODE_VALUE_SEPARATOR,
      signedHashValidationContentCharacters
    )
  ).toEqual(true);
  expect(
    doesStringHaveSomeCharacterNotInSet(
      SIGNED_HASH_VALIDATION_MESSAGE_PAYLOAD_SEPARATOR,
      signedHashValidationContentCharacters
    )
  ).toEqual(true);
});
