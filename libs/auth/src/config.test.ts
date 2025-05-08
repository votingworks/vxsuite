import { beforeEach, expect, test, vi } from 'vitest';
import { isIntegrationTest, isVxDev } from '@votingworks/utils';

import {
  ArtifactAuthenticationConfig,
  constructArtifactAuthenticationConfig,
  constructJavaCardConfig,
  constructJavaCardConfigForVxProgramming,
  constructSignedHashValidationConfig,
  constructSignedQuickResultsReportingConfig,
  JavaCardConfig,
  SignedHashValidationConfig,
  SignedQuickResultsReportingConfig,
} from './config';
import {
  pemFile,
  remotePrivateKey,
  tpmPrivateKey,
} from './cryptographic_material';

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
        configType: 'machine',
        machineCertAuthorityCert: pemFile(
          'cert',
          expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
        ),
        machinePrivateKey: pemFile(
          'private_key',
          expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
        ),
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'poll-book',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'machine',
        machineCertAuthorityCert: pemFile(
          'cert',
          expect.stringContaining(
            '/certs/dev/vx-poll-book-cert-authority-cert.pem'
          )
        ),
        machinePrivateKey: pemFile(
          'private_key',
          expect.stringContaining('/certs/dev/vx-poll-book-private-key.pem')
        ),
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'admin',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'machine',
        machineCertAuthorityCert: pemFile(
          'cert',
          '/vx/config/vx-admin-cert-authority-cert.pem'
        ),
        machinePrivateKey: tpmPrivateKey,
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/prod/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'poll-book',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'machine',
        machineCertAuthorityCert: pemFile(
          'cert',
          '/vx/config/vx-poll-book-cert-authority-cert.pem'
        ),
        machinePrivateKey: tpmPrivateKey,
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/prod/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/prod/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'admin',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'machine',
        machineCertAuthorityCert: pemFile(
          'cert',
          expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
        ),
        machinePrivateKey: pemFile(
          'private_key',
          expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
        ),
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'admin',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'machine',
        machineCertAuthorityCert: pemFile(
          'cert',
          expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
        ),
        machinePrivateKey: pemFile(
          'private_key',
          expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
        ),
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'scan',
    expectedOutput: {
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
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
        vxPrivateKey: pemFile(
          'private_key',
          expect.stringContaining('/certs/dev/vx-private-key.pem')
        ),
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    vxPrivateKeyPath: '/path/to/vx-private-key.pem',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'vx',
        vxPrivateKey: pemFile('private_key', '/path/to/vx-private-key.pem'),
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/prod/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    vxPrivateKeyPath: 'remote',
    expectedOutput: {
      cardProgrammingConfig: {
        configType: 'vx',
        vxPrivateKey: remotePrivateKey,
      },
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/prod/vx-cert-authority-cert.pem')
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
      signingMachineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
      ),
      signingMachinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'scan',
    expectedOutput: {
      signingMachineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-scan-cert.pem')
      ),
      signingMachinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'admin',
    expectedOutput: {
      signingMachineCert: pemFile(
        'cert',
        '/vx/config/vx-admin-cert-authority-cert.pem'
      ),
      signingMachinePrivateKey: tpmPrivateKey,
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/prod/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'scan',
    expectedOutput: {
      signingMachineCert: pemFile('cert', '/vx/config/vx-scan-cert.pem'),
      signingMachinePrivateKey: tpmPrivateKey,
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/prod/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'admin',
    expectedOutput: {
      signingMachineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
      ),
      signingMachinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'scan',
    expectedOutput: {
      signingMachineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-scan-cert.pem')
      ),
      signingMachinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'admin',
    expectedOutput: {
      signingMachineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
      ),
      signingMachinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'scan',
    expectedOutput: {
      signingMachineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-scan-cert.pem')
      ),
      signingMachinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
      vxCertAuthorityCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-cert-authority-cert.pem')
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
      machineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
      ),
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'scan',
    expectedOutput: {
      machineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-scan-cert.pem')
      ),
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'admin',
    expectedOutput: {
      machineCert: pemFile(
        'cert',
        '/vx/config/vx-admin-cert-authority-cert.pem'
      ),
      machinePrivateKey: tpmPrivateKey,
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'scan',
    expectedOutput: {
      machineCert: pemFile('cert', '/vx/config/vx-scan-cert.pem'),
      machinePrivateKey: tpmPrivateKey,
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'admin',
    expectedOutput: {
      machineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
      ),
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'scan',
    expectedOutput: {
      machineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-scan-cert.pem')
      ),
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'admin',
    expectedOutput: {
      machineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-admin-cert-authority-cert.pem')
      ),
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'scan',
    expectedOutput: {
      machineCert: pemFile(
        'cert',
        expect.stringContaining('/certs/dev/vx-scan-cert.pem')
      ),
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
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

test.each<{
  nodeEnv: NodeJS.ProcessEnv['NODE_ENV'];
  isVxDev?: true;
  isIntegrationTest?: true;
  machineType: NonNullable<NodeJS.ProcessEnv['VX_MACHINE_TYPE']>;
  expectedOutput: SignedQuickResultsReportingConfig;
}>([
  {
    nodeEnv: 'development',
    machineType: 'admin',
    expectedOutput: {
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'development',
    machineType: 'scan',
    expectedOutput: {
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'admin',
    expectedOutput: {
      machinePrivateKey: tpmPrivateKey,
    },
  },
  {
    nodeEnv: 'production',
    machineType: 'scan',
    expectedOutput: {
      machinePrivateKey: tpmPrivateKey,
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'admin',
    expectedOutput: {
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    machineType: 'scan',
    expectedOutput: {
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'admin',
    expectedOutput: {
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-admin-private-key.pem')
      ),
    },
  },
  {
    nodeEnv: 'production',
    isIntegrationTest: true,
    machineType: 'scan',
    expectedOutput: {
      machinePrivateKey: pemFile(
        'private_key',
        expect.stringContaining('/certs/dev/vx-scan-private-key.pem')
      ),
    },
  },
])(
  'constructSignedQuickResultsReportingConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, isIntegrationTest = $isIntegrationTest, machineType = $machineType',
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

    expect(constructSignedQuickResultsReportingConfig()).toEqual(
      expectedOutput
    );
  }
);
