import { electionSampleDefinition } from '@votingworks/fixtures';

import { getTestFilePath } from '../test/utils';
import { LiveCheckConfig } from './config';
import { LiveCheck } from './live_check';

const machineId = '0000';
const { electionHash } = electionSampleDefinition;

const vxAdminTestConfig: LiveCheckConfig = {
  machineCertPath: getTestFilePath({
    fileType: 'vx-admin-cert-authority-cert.pem',
  }),
  machinePrivateKey: {
    source: 'file',
    path: getTestFilePath({ fileType: 'vx-admin-private-key.pem' }),
  },
};

const vxScanTestConfig: LiveCheckConfig = {
  machineCertPath: getTestFilePath({
    fileType: 'vx-scan-cert.pem',
  }),
  machinePrivateKey: {
    source: 'file',
    path: getTestFilePath({ fileType: 'vx-scan-private-key.pem' }),
  },
};

test.each<{
  config: LiveCheckConfig;
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
    const liveCheck = new LiveCheck(config);
    const { qrCodeValue } = await liveCheck.generateQrCodeValue({
      machineId,
      electionHash: isMachineConfiguredForAnElection ? electionHash : undefined,
    });
    expect(qrCodeValue).toHaveLength(expectedQrCodeValueLength);
  }
);
