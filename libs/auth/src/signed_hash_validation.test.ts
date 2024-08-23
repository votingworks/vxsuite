import { getTestFilePath } from '../test/utils';
import { SignedHashValidationConfig } from './config';
import { generateSignedHashValidationQrCodeValue } from './signed_hash_validation';

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
    expectedQrCodeValueLength: 859,
  },
  {
    config: vxAdminTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 844,
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: true,
    expectedQrCodeValueLength: 696,
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 681,
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
