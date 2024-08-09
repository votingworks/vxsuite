import { electionGeneralDefinition } from '@votingworks/fixtures';

import { getTestFilePath } from '../test/utils';
import { SignedHashValidationConfig } from './config';
import { SignedHashValidation } from './signed_hash_validation';

const machineId = '0000';
const { ballotHash } = electionGeneralDefinition;

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
    expectedQrCodeValueLength: 818,
  },
  {
    config: vxAdminTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 808,
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: true,
    expectedQrCodeValueLength: 655,
  },
  {
    config: vxScanTestConfig,
    isMachineConfiguredForAnElection: false,
    expectedQrCodeValueLength: 645,
  },
])(
  'Generating QR code value',
  async ({
    config,
    isMachineConfiguredForAnElection,
    expectedQrCodeValueLength,
  }) => {
    const signedHashValidation = new SignedHashValidation(config);
    const { qrCodeValue } = await signedHashValidation.generateQrCodeValue({
      machineId,
      ballotHash: isMachineConfiguredForAnElection ? ballotHash : undefined,
    });
    expect([
      expectedQrCodeValueLength,
      // There's a slight chance that the base64-encoded signature within the QR code value is 92
      // characters long instead of 96. (The length of a base64-encoded string is always a multiple
      // of 4.)
      expectedQrCodeValueLength - 4,
    ]).toContain(qrCodeValue.length);
  }
);
