import path from 'path';
import { isVxDev } from '@votingworks/utils';

import { getRequiredEnvVar } from './env_vars';
import { FileKey, TpmKey } from './keys';

/**
 * Config params for the Java Card implementation of the card API
 */
export interface JavaCardConfig {
  /** Only VxAdmin should provide these params, for card programming */
  cardProgrammingConfig?: {
    vxAdminCertAuthorityCertPath: string;
    vxAdminPrivateKey: FileKey | TpmKey;
  };
  /** Only tests should provide this param, to make challenge generation non-random */
  customChallengeGenerator?: () => string;
  /** The path to the VotingWorks cert authority cert on the machine */
  vxCertAuthorityCertPath: string;
}

function shouldUseProdCerts(): boolean {
  return process.env.NODE_ENV === 'production' && !isVxDev();
}

function constructCardProgrammingConfig(): JavaCardConfig['cardProgrammingConfig'] {
  if (shouldUseProdCerts()) {
    const vxConfigRoot = getRequiredEnvVar('VX_CONFIG_ROOT');
    return {
      vxAdminCertAuthorityCertPath: path.join(
        vxConfigRoot,
        'vx-admin-cert-authority-cert.pem'
      ),
      vxAdminPrivateKey: { source: 'tpm' },
    };
  }
  return {
    vxAdminCertAuthorityCertPath: path.join(
      __dirname,
      '../certs/dev/vx-admin-cert-authority-cert.pem'
    ),
    vxAdminPrivateKey: {
      source: 'file',
      path: path.join(__dirname, '../certs/dev/vx-admin-private-key.pem'),
    },
  };
}

/**
 * Constructs a Java Card config
 */
export function constructJavaCardConfig(): JavaCardConfig {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  return {
    cardProgrammingConfig:
      machineType === 'admin' ? constructCardProgrammingConfig() : undefined,
    vxCertAuthorityCertPath: shouldUseProdCerts()
      ? // We can commit this prod cert to the codebase because it's 1) universal and 2) public
        path.join(__dirname, '../certs/prod/vx-cert-authority-cert.pem')
      : path.join(__dirname, '../certs/dev/vx-cert-authority-cert.pem'),
  };
}
