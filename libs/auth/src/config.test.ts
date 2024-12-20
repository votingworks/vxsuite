import { beforeEach, expect, test, vi } from 'vitest';
import { isIntegrationTest, isVxDev } from '@votingworks/utils';

import {
  ArtifactAuthenticationConfig,
  constructArtifactAuthenticationConfig,
  constructJavaCardConfig,
  constructJavaCardConfigForVxProgramming,
  constructSignedHashValidationConfig,
  JavaCardConfig,
  SignedHashValidationConfig,
} from './config';

vi.mock(
  '@votingworks/utils',
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual<typeof import('@votingworks/utils')>()),
    isVxDev: vi.fn(),
    isIntegrationTest: vi.fn(),
  })
);

beforeEach(() => {
  (process.env.NODE_ENV as string) = 'test';
  (process.env.VX_CONFIG_ROOT as string) = '/vx/config';
  vi.mocked(isVxDev).mockImplementation(() => false);
  vi.mocked(isIntegrationTest).mockImplementation(() => false);
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
        configType: 'vx_admin',
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
        configType: 'vx_admin',
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
        configType: 'vx_admin',
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
        configType: 'vx_admin',
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
    vi.mocked(isVxDev).mockImplementation(() => isVxDevResult ?? false);
    vi.mocked(isIntegrationTest).mockImplementation(
      () => isIntegrationTestResult ?? false
    );

    expect(constructJavaCardConfig()).toEqual(expectedOutput);
  }
);

test.each<{
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'];
  vxPrivateKeyPath?: string;
  expectedOutput: JavaCardConfig;
}>([
  {
    nodeEnv: 'development',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'vx',
        vxPrivateKey: {
          source: 'file',
          path: expect.stringContaining('/certs/dev/vx-private-key.pem'),
        },
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    vxPrivateKeyPath: '/path/to/vx-private-key.pem',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'vx',
        vxPrivateKey: {
          source: 'file',
          path: '/path/to/vx-private-key.pem',
        },
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/prod/vx-cert-authority-cert.pem'
      ),
    },
  },
])(
  'constructJavaCardConfigForVxProgramming - nodeEnv = $nodeEnv, vxPrivateKeyPath = $vxPrivateKeyPath',
  ({ nodeEnv, vxPrivateKeyPath, expectedOutput }) => {
    (process.env.NODE_ENV as string) = nodeEnv;
    process.env['VX_PRIVATE_KEY_PATH'] = vxPrivateKeyPath;

    expect(constructJavaCardConfigForVxProgramming()).toEqual(expectedOutput);
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
    vi.mocked(isVxDev).mockImplementation(() => isVxDevResult ?? false);
    vi.mocked(isIntegrationTest).mockImplementation(
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
  expectedOutput: SignedHashValidationConfig;
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
  'constructSignedHashValidationConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, isIntegrationTest = $isIntegrationTest, machineType = $machineType',
  ({
    nodeEnv,
    isVxDev: isVxDevResult,
    isIntegrationTest: isIntegrationTestResult,
    machineType,
    expectedOutput,
  }) => {
    (process.env.NODE_ENV as string) = nodeEnv;
    (process.env.VX_MACHINE_TYPE as string) = machineType;
    vi.mocked(isVxDev).mockImplementation(() => isVxDevResult ?? false);
    vi.mocked(isIntegrationTest).mockImplementation(
      () => isIntegrationTestResult ?? false
    );

    expect(constructSignedHashValidationConfig()).toEqual(expectedOutput);
  }
);
