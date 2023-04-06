import path from 'path';
import { assert } from '@votingworks/basics';
import { isVxDev } from '@votingworks/utils';

/**
 * Config params for the Java Card implementation of the card API
 */
export interface JavaCardConfig {
  /** Only VxAdmin should provide these params, for card programming */
  cardProgrammingConfig?: {
    vxAdminCertAuthorityCertPath: string;
    vxAdminPrivateKeyPassword: string;
    vxAdminPrivateKeyPath: string;
  };
  /** Only tests should provide this param, to make challenge generation non-random */
  customChallengeGenerator?: () => string;
  /** The path to the VotingWorks cert authority cert on the machine */
  vxCertAuthorityCertPath: string;
}

/**
 * Should be kept in sync with vxsuite-complete-system scripts
 */
const PROD_CONFIG_DIRECTORY = '/vx/config';

/**
 * The password for all dev private keys
 */
export const DEV_PRIVATE_KEY_PASSWORD = '1234';

function shouldUseProdCerts(): boolean {
  return process.env.NODE_ENV === 'production' && !isVxDev();
}

function constructCardProgrammingConfig(): JavaCardConfig['cardProgrammingConfig'] {
  if (shouldUseProdCerts()) {
    assert(process.env.VX_ADMIN_PRIVATE_KEY_PASSWORD !== undefined);
    return {
      vxAdminCertAuthorityCertPath: path.join(
        PROD_CONFIG_DIRECTORY,
        'vx-admin-cert-authority-cert.pem'
      ),
      vxAdminPrivateKeyPassword: process.env.VX_ADMIN_PRIVATE_KEY_PASSWORD,
      vxAdminPrivateKeyPath: path.join(
        PROD_CONFIG_DIRECTORY,
        'vx-admin-private-key.pem'
      ),
    };
  }
  return {
    vxAdminCertAuthorityCertPath: path.join(
      __dirname,
      '../certs/dev/vx-admin-cert-authority-cert.pem'
    ),
    vxAdminPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
    vxAdminPrivateKeyPath: path.join(
      __dirname,
      '../certs/dev/vx-admin-private-key.pem'
    ),
  };
}

/**
 * Constructs a Java Card config
 */
export function constructJavaCardConfig({
  includeCardProgrammingConfig,
}: {
  includeCardProgrammingConfig?: boolean;
} = {}): JavaCardConfig {
  return {
    cardProgrammingConfig: includeCardProgrammingConfig
      ? constructCardProgrammingConfig()
      : undefined,
    vxCertAuthorityCertPath: shouldUseProdCerts()
      ? path.join(__dirname, '../certs/prod/vx-cert-authority-cert.pem')
      : path.join(__dirname, '../certs/dev/vx-cert-authority-cert.pem'),
  };
}
