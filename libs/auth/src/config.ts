import path from 'node:path';
import { isIntegrationTest, isVxDev } from '@votingworks/utils';

import { getRequiredEnvVar, isNodeEnvProduction } from './env_vars';
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
  return isNodeEnvProduction() && !isVxDev() && !isIntegrationTest();
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

interface VxAdminCardProgrammingConfig {
  configType: 'vx_admin';
  vxAdminCertAuthorityCertPath: string;
  vxAdminPrivateKey: FileKey | TpmKey;
}

interface VxCardProgrammingConfig {
  configType: 'vx';
  vxPrivateKey: FileKey;
}

/**
 * Config params for card programming, by either a VxAdmin or VotingWorks directly
 */
export type CardProgrammingConfig =
  | VxAdminCardProgrammingConfig
  | VxCardProgrammingConfig;

/**
 * Config params for the Java Card implementation of the card API
 */
export interface JavaCardConfig {
  /** For card programming */
  cardProgrammingConfig?: CardProgrammingConfig;
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
  let cardProgrammingConfig: CardProgrammingConfig | undefined;
  if (machineType === 'admin') {
    const { certPath, privateKey } = getMachineCertPathAndPrivateKey();
    cardProgrammingConfig = {
      configType: 'vx_admin',
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
 * Constructs a Java Card config given relevant env vars, for VotingWorks programming, specifically
 * initial Java Card configuration and vendor card programming
 */
export function constructJavaCardConfigForVxProgramming(): JavaCardConfig {
  const vxPrivateKeyPath = shouldUseProdCerts()
    ? getRequiredEnvVar('VX_PRIVATE_KEY_PATH')
    : path.join(__dirname, '../certs/dev/vx-private-key.pem');
  return {
    cardProgrammingConfig: {
      configType: 'vx',
      vxPrivateKey: { source: 'file', path: vxPrivateKeyPath },
    },
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
 * Config params for a signed hash validation instance
 */
export interface SignedHashValidationConfig {
  machineCertPath: string;
  machinePrivateKey: FileKey | TpmKey;
}

/**
 * Constructs a signed hash validation config given relevant env vars
 */
export function constructSignedHashValidationConfig(): SignedHashValidationConfig {
  const { certPath, privateKey } = getMachineCertPathAndPrivateKey();
  return {
    machineCertPath: certPath,
    machinePrivateKey: privateKey,
  };
}
