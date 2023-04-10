import path from 'path';
import { assert } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isVxDev,
} from '@votingworks/utils';

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
 * The password for all dev private keys
 */
export const DEV_PRIVATE_KEY_PASSWORD = '1234';

function shouldUseProdCerts(): boolean {
  return isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_DEV_CERTS_IN_PROD
  )
    ? /* istanbul ignore next */ false
    : process.env.NODE_ENV === 'production' && !isVxDev();
}

function constructCardProgrammingConfig(): JavaCardConfig['cardProgrammingConfig'] {
  if (shouldUseProdCerts()) {
    assert(process.env.CONFIG_DIRECTORY !== undefined);
    assert(process.env.VX_ADMIN_PRIVATE_KEY_PASSWORD !== undefined);
    return {
      vxAdminCertAuthorityCertPath: path.join(
        process.env.CONFIG_DIRECTORY,
        'vx-admin-cert-authority-cert.pem'
      ),
      vxAdminPrivateKeyPassword: process.env.VX_ADMIN_PRIVATE_KEY_PASSWORD,
      vxAdminPrivateKeyPath: path.join(
        process.env.CONFIG_DIRECTORY,
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
      ? // We can commit this prod cert to the codebase because it's 1) universal and 2) public
        path.join(__dirname, '../certs/prod/vx-cert-authority-cert.pem')
      : path.join(__dirname, '../certs/dev/vx-cert-authority-cert.pem'),
  };
}
