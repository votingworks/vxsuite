import {
  constructDevJavaCardConfig,
  DEV_PRIVATE_KEY_PASSWORD,
  JavaCardConfig,
} from './java_card_config';

test.each<{
  input: { includeCardProgrammingConfig?: boolean; pathToAuthLibRoot: string };
  expectedOutput: JavaCardConfig;
}>([
  {
    input: {
      pathToAuthLibRoot: '../../../libs/auth',
    },
    expectedOutput: {
      vxCertAuthorityCertPath:
        '../../../libs/auth/certs/dev/vx-cert-authority-cert.pem',
    },
  },
  {
    input: {
      includeCardProgrammingConfig: true,
      pathToAuthLibRoot: '.',
    },
    expectedOutput: {
      cardProgrammingConfig: {
        vxAdminCertAuthorityCertPath:
          './certs/dev/vx-admin-cert-authority-cert.pem',
        vxAdminOpensslConfigPath: './certs/openssl.cnf',
        vxAdminPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
        vxAdminPrivateKeyPath: './certs/dev/vx-admin-private-key.pem',
      },
      vxCertAuthorityCertPath: './certs/dev/vx-cert-authority-cert.pem',
    },
  },
])('constructDevJavaCardConfig', ({ input, expectedOutput }) => {
  expect(constructDevJavaCardConfig(input)).toEqual(expectedOutput);
});
