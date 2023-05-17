import path from 'path';
import { isVxDev } from '@votingworks/utils';

import { getRequiredEnvVar } from './env_vars';
import { FileKey, TpmKey } from './keys';

function shouldUseProdCerts(): boolean {
  return process.env.NODE_ENV === 'production' && !isVxDev();
}

function getVxCertAuthorityCertPath(): string {
  return shouldUseProdCerts()
    ? // We can commit this prod cert to the codebase because it's 1) universal and 2) public
      path.join(__dirname, '../certs/prod/vx-cert-authority-cert.pem')
    : path.join(__dirname, '../certs/dev/vx-cert-authority-cert.pem');
}

function getMachineCertPathAndPrivateKey(): {
  certPath: string;
  privateKey: FileKey | TpmKey;
} {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  const machineCertFileName =
    machineType === 'admin'
      ? 'vx-admin-cert-authority-cert.pem'
      : `vx-${machineType}-cert.pem`;
  if (shouldUseProdCerts()) {
    const configRoot = getRequiredEnvVar('VX_CONFIG_ROOT');
    return {
      certPath: path.join(configRoot, machineCertFileName),
      privateKey: { source: 'tpm' },
    };
  }
  return {
    certPath: path.join(__dirname, '../certs/dev', machineCertFileName),
    privateKey: {
      source: 'file',
      path: path.join(
        __dirname,
        '../certs/dev',
        `vx-${machineType}-private-key.pem`
      ),
    },
  };
}

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
  /** The path to the VotingWorks cert authority cert */
  vxCertAuthorityCertPath: string;
}

/**
 * Constructs a Java Card config given relevant env vars
 */
export function constructJavaCardConfig(): JavaCardConfig {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  let cardProgrammingConfig:
    | JavaCardConfig['cardProgrammingConfig']
    | undefined;
  if (machineType === 'admin') {
    const { certPath, privateKey } = getMachineCertPathAndPrivateKey();
    cardProgrammingConfig = {
      vxAdminCertAuthorityCertPath: certPath,
      vxAdminPrivateKey: privateKey,
    };
  }
  return {
    cardProgrammingConfig,
    vxCertAuthorityCertPath: getVxCertAuthorityCertPath(),
  };
}

/**
 * Config params for an artifact authenticator
 */
export interface ArtifactAuthenticatorConfig {
  signingMachineCertPath: string;
  signingMachinePrivateKey: FileKey | TpmKey;
  vxCertAuthorityCertPath: string;
}

/**
 * Constructs an artifact authenticator config given relevant env vars
 */
export function constructArtifactAuthenticatorConfig(): ArtifactAuthenticatorConfig {
  const { certPath, privateKey } = getMachineCertPathAndPrivateKey();
  return {
    signingMachineCertPath: certPath,
    signingMachinePrivateKey: privateKey,
    vxCertAuthorityCertPath: getVxCertAuthorityCertPath(),
  };
}
