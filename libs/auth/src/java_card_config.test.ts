import { mockOf } from '@votingworks/test-utils';
import { isVxDev } from '@votingworks/utils';

import {
  constructJavaCardConfig,
  DEV_PRIVATE_KEY_PASSWORD,
  JavaCardConfig,
} from './java_card_config';

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isVxDev: jest.fn(),
}));

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.VX_CONFIG_ROOT = '/vx/config';
  process.env.VX_MACHINE_PRIVATE_KEY_PASSWORD = '5678';

  mockOf(isVxDev).mockImplementation(() => false);
});

test.each<{
  nodeEnv: 'development' | 'production' | 'test';
  isVxDev?: true;
  input: Parameters<typeof constructJavaCardConfig>[0];
  expectedOutput: JavaCardConfig;
}>([
  {
    nodeEnv: 'development',
    input: undefined,
    expectedOutput: {
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    input: undefined,
    expectedOutput: {
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/prod/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    input: undefined,
    expectedOutput: {
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'development',
    input: { includeCardProgrammingConfig: true },
    expectedOutput: {
      cardProgrammingConfig: {
        vxAdminCertAuthorityCertPath: expect.stringContaining(
          '/certs/dev/vx-admin-cert-authority-cert.pem'
        ),
        vxAdminPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
        vxAdminPrivateKeyPath: expect.stringContaining(
          '/certs/dev/vx-admin-private-key.pem'
        ),
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    input: { includeCardProgrammingConfig: true },
    expectedOutput: {
      cardProgrammingConfig: {
        vxAdminCertAuthorityCertPath:
          '/vx/config/vx-admin-cert-authority-cert.pem',
        vxAdminPrivateKeyPassword: '5678',
        vxAdminPrivateKeyPath: '/vx/config/vx-admin-private-key.pem',
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/prod/vx-cert-authority-cert.pem'
      ),
    },
  },
  {
    nodeEnv: 'production',
    isVxDev: true,
    input: { includeCardProgrammingConfig: true },
    expectedOutput: {
      cardProgrammingConfig: {
        vxAdminCertAuthorityCertPath: expect.stringContaining(
          '/certs/dev/vx-admin-cert-authority-cert.pem'
        ),
        vxAdminPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
        vxAdminPrivateKeyPath: expect.stringContaining(
          '/certs/dev/vx-admin-private-key.pem'
        ),
      },
      vxCertAuthorityCertPath: expect.stringContaining(
        '/certs/dev/vx-cert-authority-cert.pem'
      ),
    },
  },
])(
  'constructJavaCardConfig - nodeEnv = $nodeEnv, isVxDev = $isVxDev, input = $input',
  ({ nodeEnv, isVxDev: isVxDevResult = false, input, expectedOutput }) => {
    process.env.NODE_ENV = nodeEnv;
    mockOf(isVxDev).mockImplementation(() => isVxDevResult);
    expect(constructJavaCardConfig(input)).toEqual(expectedOutput);
  }
);
