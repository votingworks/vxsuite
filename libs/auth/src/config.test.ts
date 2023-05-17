import { mockOf } from '@votingworks/test-utils';
import { isVxDev } from '@votingworks/utils';

import {
  constructArtifactAuthenticatorConfig,
  constructJavaCardConfig,
  ArtifactAuthenticatorConfig,
  JavaCardConfig,
} from './config';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isVxDev: jest.fn(),
}));

beforeEach(() => {
  (process.env.NODE_ENV as string) = 'test';
  (process.env.VX_CONFIG_ROOT as string) = '/vx/config';
  mockOf(isVxDev).mockImplementation(() => false);
});

test.each<{
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'];
  isVxDev?: true;
  machineType: NonNullable<NodeJS.ProcessEnv['VX_MACHINE_TYPE']>;
  expectedOutput: JavaCardConfig;
}>([
  {
    nodeEnv: 'development',
    machineType: 'admin',
    expectedOutput: {
      cardProgrammingConfig: {
        vxAdminCertAuthorityCertPath: expect.stringContaining(
          '/certs/dev/vx-admin-cert-authority-cert.pem'
        ),
        vxAdminPrivateKey: {
          source: 'file',
          path: expect.stringContaining('/certs/dev/vx-admin-private-key.pem'),
        },
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'admin',
    expectedOutput: {
      cardProgrammingConfig: {
        vxAdminCertAuthorityCertPath:
          '/vx/config/vx-admin-cert-authority-cert.pem',
        vxAdminPrivateKey: { source: 'tpm' },
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/prod/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/prod/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'admin',
    expectedOutput: {
      cardProgrammingConfig: {
        vxAdminCertAuthorityCertPath: expect.stringContaining(
          '/certs/dev/vx-admin-cert-authority-cert.pem'
        ),
        vxAdminPrivateKey: {
          source: 'file',
          path: expect.stringContaining('/certs/dev/vx-admin-private-key.pem'),
        },
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
])(
  'constructJavaCardConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, machineType = $machineType',
  ({ nodeEnv, isVxDev: isVxDevResult, machineType, expectedOutput }) => {
    (process.env.NODE_ENV as string) = nodeEnv;
    (process.env.VX_MACHINE_TYPE as string) = machineType;
    mockOf(isVxDev).mockImplementation(() => isVxDevResult ?? false);

    expect(constructJavaCardConfig()).toEqual(expectedOutput);
  }
);

test.each<{
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'];
  isVxDev?: true;
  machineType: NonNullable<NodeJS.ProcessEnv['VX_MACHINE_TYPE']>;
  expectedOutput: ArtifactAuthenticatorConfig;
}>([
  {
    nodeEnv: 'development',
    machineType: 'admin',
    expectedOutput: {
      signingMachineCertPath: expect.stringContaining(
        '/certs/dev/vx-admin-cert-authority-cert.pem'
      ),
      signingMachinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-admin-private-key.pem'),
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'scan',
    expectedOutput: {
      signingMachineCertPath: expect.stringContaining(
        '/certs/dev/vx-scan-cert.pem'
      ),
      signingMachinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-scan-private-key.pem'),
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'admin',
    expectedOutput: {
      signingMachineCertPath: '/vx/config/vx-admin-cert-authority-cert.pem',
      signingMachinePrivateKey: { source: 'tpm' },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/prod/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'scan',
    expectedOutput: {
      signingMachineCertPath: '/vx/config/vx-scan-cert.pem',
      signingMachinePrivateKey: { source: 'tpm' },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/prod/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'admin',
    expectedOutput: {
      signingMachineCertPath: expect.stringContaining(
        '/certs/dev/vx-admin-cert-authority-cert.pem'
      ),
      signingMachinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-admin-private-key.pem'),
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'scan',
    expectedOutput: {
      signingMachineCertPath: expect.stringContaining(
        '/certs/dev/vx-scan-cert.pem'
      ),
      signingMachinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-scan-private-key.pem'),
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
])(
  'constructArtifactAuthenticatorConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, machineType = $machineType',
  ({ nodeEnv, isVxDev: isVxDevResult, machineType, expectedOutput }) => {
    (process.env.NODE_ENV as string) = nodeEnv;
    (process.env.VX_MACHINE_TYPE as string) = machineType;
    mockOf(isVxDev).mockImplementation(() => isVxDevResult ?? false);

    expect(constructArtifactAuthenticatorConfig()).toEqual(expectedOutput);
  }
);
