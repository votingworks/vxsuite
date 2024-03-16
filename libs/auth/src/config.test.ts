import { mockOf } from '@votingworks/test-utils';
import { isIntegrationTest, isVxDev } from '@votingworks/utils';
import { expect, mock, test } from 'bun:test';

import {
  ArtifactAuthenticationConfig,
  constructArtifactAuthenticationConfig,
  constructJavaCardConfig,
  constructLiveCheckConfig,
  JavaCardConfig,
  LiveCheckConfig,
} from './config';

void mock.module(
  '@votingworks/utils',
  (): typeof import('@votingworks/utils') => ({
    ...jest.requireActual('@votingworks/utils'),
    isVxDev: jest.fn(),
    isIntegrationTest: jest.fn(),
  })
);

beforeEach(() => {
  (process.env.NODE_ENV as string) = 'test';
  (process.env.VX_CONFIG_ROOT as string) = '/vx/config';
  mockOf(isVxDev).mockImplementation(() => false);
  mockOf(isIntegrationTest).mockImplementation(() => false);
});

test.each<{
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'];
  isVxDev?: true;
  isIntegrationTest?: true;
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
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
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
    isIntegrationTest: true,
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
])(
  'constructJavaCardConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, isIntegrationTest = $isIntegrationTest, machineType = $machineType',
  ({
    nodeEnv,
    isVxDev: isVxDevResult,
    isIntegrationTest: isIntegrationTestResult,
    machineType,
    expectedOutput,
  }) => {
    (process.env.NODE_ENV as string) = nodeEnv;
    (process.env.VX_MACHINE_TYPE as string) = machineType;
    mockOf(isVxDev).mockImplementation(() => isVxDevResult ?? false);
    mockOf(isIntegrationTest).mockImplementation(
      () => isIntegrationTestResult ?? false
    );

    expect(constructJavaCardConfig()).toEqual(expectedOutput);
  }
);

test.each<{
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'];
  isVxDev?: true;
  isIntegrationTest?: true;
  machineType: NonNullable<NodeJS.ProcessEnv['VX_MACHINE_TYPE']>;
  expectedOutput: ArtifactAuthenticationConfig;
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
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
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
    isIntegrationTest: true,
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
  'constructArtifactAuthenticatorConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, isIntegrationTest = $isIntegrationTest, machineType = $machineType',
  ({
    nodeEnv,
    isVxDev: isVxDevResult,
    isIntegrationTest: isIntegrationTestResult,
    machineType,
    expectedOutput,
  }) => {
    (process.env.NODE_ENV as string) = nodeEnv;
    (process.env.VX_MACHINE_TYPE as string) = machineType;
    mockOf(isVxDev).mockImplementation(() => isVxDevResult ?? false);
    mockOf(isIntegrationTest).mockImplementation(
      () => isIntegrationTestResult ?? false
    );

    expect(constructArtifactAuthenticationConfig()).toEqual(expectedOutput);
  }
);

test.each<{
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'];
  isVxDev?: true;
  isIntegrationTest?: true;
  machineType: NonNullable<NodeJS.ProcessEnv['VX_MACHINE_TYPE']>;
  expectedOutput: LiveCheckConfig;
}>([
  {
    nodeEnv: 'development',
    machineType: 'admin',
    expectedOutput: {
      machineCertPath: expect.stringContaining(
        '/certs/dev/vx-admin-cert-authority-cert.pem'
      ),
      machinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-admin-private-key.pem'),
      },
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'scan',
    expectedOutput: {
      machineCertPath: expect.stringContaining('/certs/dev/vx-scan-cert.pem'),
      machinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-scan-private-key.pem'),
      },
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'admin',
    expectedOutput: {
      machineCertPath: '/vx/config/vx-admin-cert-authority-cert.pem',
      machinePrivateKey: { source: 'tpm' },
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'scan',
    expectedOutput: {
      machineCertPath: '/vx/config/vx-scan-cert.pem',
      machinePrivateKey: { source: 'tpm' },
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'admin',
    expectedOutput: {
      machineCertPath: expect.stringContaining(
        '/certs/dev/vx-admin-cert-authority-cert.pem'
      ),
      machinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-admin-private-key.pem'),
      },
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'scan',
    expectedOutput: {
      machineCertPath: expect.stringContaining('/certs/dev/vx-scan-cert.pem'),
      machinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-scan-private-key.pem'),
      },
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'admin',
    expectedOutput: {
      machineCertPath: expect.stringContaining(
        '/certs/dev/vx-admin-cert-authority-cert.pem'
      ),
      machinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-admin-private-key.pem'),
      },
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'scan',
    expectedOutput: {
      machineCertPath: expect.stringContaining('/certs/dev/vx-scan-cert.pem'),
      machinePrivateKey: {
        source: 'file',
        path: expect.stringContaining('/certs/dev/vx-scan-private-key.pem'),
      },
    },
  },
])(
  'constructLiveCheckConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, isIntegrationTest = $isIntegrationTest, machineType = $machineType',
  ({
    nodeEnv,
    isVxDev: isVxDevResult,
    isIntegrationTest: isIntegrationTestResult,
    machineType,
    expectedOutput,
  }) => {
    (process.env.NODE_ENV as string) = nodeEnv;
    (process.env.VX_MACHINE_TYPE as string) = machineType;
    mockOf(isVxDev).mockImplementation(() => isVxDevResult ?? false);
    mockOf(isIntegrationTest).mockImplementation(
      () => isIntegrationTestResult ?? false
    );

    expect(constructLiveCheckConfig()).toEqual(expectedOutput);
  }
);
