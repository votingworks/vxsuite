/**
 * Config params for the Java Card implementation of the card API
 */
export interface JavaCardConfig {
  /** Additional config params that only VxAdmin needs to provide for card programming */
  cardProgrammingConfig?: {
    vxAdminCertAuthorityCertPath: string;
    vxAdminOpensslConfigPath: string;
    vxAdminPrivateKeyPassword: string;
    vxAdminPrivateKeyPath: string;
  };
  vxCertAuthorityCertPath: string;
}

/**
 * The password for all dev private keys
 */
export const DEV_PRIVATE_KEY_PASSWORD = '1234';

function constructDevCardProgrammingConfig(
  pathToAuthLibRoot: string
): JavaCardConfig['cardProgrammingConfig'] {
  return {
    vxAdminCertAuthorityCertPath: `${pathToAuthLibRoot}/certs/dev/vx-admin-cert-authority-cert.pem`,
    vxAdminOpensslConfigPath: `${pathToAuthLibRoot}/certs/openssl.cnf`,
    vxAdminPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
    vxAdminPrivateKeyPath: `${pathToAuthLibRoot}/certs/dev/vx-admin-private-key.pem`,
  };
}

/**
 * Constructs a dev Java Card config
 */
export function constructDevJavaCardConfig({
  includeCardProgrammingConfig,
  pathToAuthLibRoot,
}: {
  includeCardProgrammingConfig?: boolean;
  pathToAuthLibRoot: string;
}): JavaCardConfig {
  return {
    cardProgrammingConfig: includeCardProgrammingConfig
      ? constructDevCardProgrammingConfig(pathToAuthLibRoot)
      : undefined,
    vxCertAuthorityCertPath: `${pathToAuthLibRoot}/certs/dev/vx-cert-authority-cert.pem`,
  };
}
