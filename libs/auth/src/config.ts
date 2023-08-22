import path from 'path';
import { isIntegrationTest, isVxDev } from '@votingworks/utils';

import { getRequiredEnvVar } from './env_vars';
import { FileKey, TpmKey } from './keys';

/**
 * The path to the dev root cert
 */
export const DEV_VX_CERT_AUTHORITY_CERT_PATH = path.join(
  __dirname,
  '../certs/dev/vx-cert-authority-cert.pem'
);

/**
 * The path to the prod root cert. We can commit this cert to the codebase because it's 1)
 * universal and 2) public.
 */
export const PROD_VX_CERT_AUTHORITY_CERT_PATH = path.join(
  __dirname,
  '../certs/prod/vx-cert-authority-cert.pem'
);

function shouldUseProdCerts(): boolean {
  return (
    process.env.NODE_ENV === 'production' && !isVxDev() && !isIntegrationTest()
  );
}

function getVxCertAuthorityCertPath(): string {
  return shouldUseProdCerts()
    ? PROD_VX_CERT_AUTHORITY_CERT_PATH
    : DEV_VX_CERT_AUTHORITY_CERT_PATH;
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
  /** The path to the VotingWorks cert authority cert */
  vxCertAuthorityCertPath: string;

  /** Only tests should provide this param, to make challenge generation non-random */
  generateChallengeOverride?: () => string;
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
 * Config params for artifact authentication
 */
export interface ArtifactAuthenticationConfig {
  signingMachineCertPath: string;
  signingMachinePrivateKey: FileKey | TpmKey;
  vxCertAuthorityCertPath: string;

  /** Only tests should provide this param */
  isFileOnRemovableDeviceOverride?: (filePath: string) => boolean;
}

/**
 * Constructs an artifact authentication config given relevant env vars
 */
export function constructArtifactAuthenticationConfig(): ArtifactAuthenticationConfig {
  const { certPath, privateKey } = getMachineCertPathAndPrivateKey();
  return {
    signingMachineCertPath: certPath,
    signingMachinePrivateKey: privateKey,
    vxCertAuthorityCertPath: getVxCertAuthorityCertPath(),
  };
}

/**
 * Config params for a Live Check instance
 */
export interface LiveCheckConfig {
  machineCertPath: string;
  machinePrivateKey: FileKey | TpmKey;
}

/**
 * Constructs a Live Check config given relevant env vars
 */
export function constructLiveCheckConfig(): LiveCheckConfig {
  const { certPath, privateKey } = getMachineCertPathAndPrivateKey();
  return {
    machineCertPath: certPath,
    machinePrivateKey: privateKey,
  };
}
