import path from 'node:path';
import { isIntegrationTest, isVxDev } from '@votingworks/utils';

import {
  CertPemFile,
  pemFile,
  PrivateKeyPemFile,
  remotePrivateKey,
  RemotePrivateKey,
  tpmPrivateKey,
  TpmPrivateKey,
} from './cryptographic_material';
import { getRequiredEnvVar, isNodeEnvProduction } from './env_vars';

/**
 * The dev root cert
 */
export const DEV_VX_CERT_AUTHORITY_CERT: CertPemFile = pemFile(
  'cert',
  path.join(__dirname, '../certs/dev/vx-cert-authority-cert.pem')
);

/**
 * The prod root cert. We can commit this cert to the codebase because it's 1) universal and 2)
 * public.
 */
export const PROD_VX_CERT_AUTHORITY_CERT: CertPemFile = pemFile(
  'cert',
  path.join(__dirname, '../certs/prod/vx-cert-authority-cert.pem')
);

function shouldUseProdCerts(): boolean {
  return isNodeEnvProduction() && !isVxDev() && !isIntegrationTest();
}

function getVxCertAuthorityCert(): CertPemFile {
  return shouldUseProdCerts()
    ? PROD_VX_CERT_AUTHORITY_CERT
    : DEV_VX_CERT_AUTHORITY_CERT;
}

function getMachineCertAndPrivateKey(): {
  cert: CertPemFile;
  privateKey: PrivateKeyPemFile | TpmPrivateKey;
} {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  const machineCertFileName =
    machineType === 'admin' || machineType === 'poll-book'
      ? `vx-${machineType}-cert-authority-cert.pem`
      : `vx-${machineType}-cert.pem`;
  const machinePrivateKeyFileName = `vx-${machineType}-private-key.pem`;
  if (shouldUseProdCerts()) {
    const configRoot = getRequiredEnvVar('VX_CONFIG_ROOT');
    return {
      cert: pemFile('cert', path.join(configRoot, machineCertFileName)),
      privateKey: tpmPrivateKey,
    };
  }
  return {
    cert: pemFile(
      'cert',
      path.join(__dirname, '../certs/dev', machineCertFileName)
    ),
    privateKey: pemFile(
      'private_key',
      path.join(__dirname, '../certs/dev', machinePrivateKeyFileName)
    ),
  };
}

interface MachineCardProgrammingConfig {
  configType: 'machine';
  machineCertAuthorityCert: CertPemFile;
  machinePrivateKey: PrivateKeyPemFile | TpmPrivateKey;
}

interface VxCardProgrammingConfig {
  configType: 'vx';
  vxPrivateKey: PrivateKeyPemFile | RemotePrivateKey;
}

/**
 * Config params for card programming, by a VxAdmin, VxPollBook, or VotingWorks directly
 */
export type CardProgrammingConfig =
  | MachineCardProgrammingConfig
  | VxCardProgrammingConfig;

/**
 * Config params for the Java Card implementation of the card API
 */
export interface JavaCardConfig {
  /** For card programming */
  cardProgrammingConfig?: CardProgrammingConfig;
  /** The path to the VotingWorks cert authority cert */
  vxCertAuthorityCert: CertPemFile;

  /** Only tests should provide this param, to make challenge generation non-random */
  generateChallengeOverride?: () => string;
}

/**
 * Constructs a Java Card config given relevant env vars
 */
export function constructJavaCardConfig(): JavaCardConfig {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  let cardProgrammingConfig: CardProgrammingConfig | undefined;
  if (machineType === 'admin' || machineType === 'poll-book') {
    const { cert, privateKey } = getMachineCertAndPrivateKey();
    cardProgrammingConfig = {
      configType: 'machine',
      machineCertAuthorityCert: cert,
      machinePrivateKey: privateKey,
    };
  }
  return {
    cardProgrammingConfig,
    vxCertAuthorityCert: getVxCertAuthorityCert(),
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
      vxPrivateKey:
        vxPrivateKeyPath === 'remote'
          ? remotePrivateKey
          : pemFile('private_key', vxPrivateKeyPath),
    },
    vxCertAuthorityCert: getVxCertAuthorityCert(),
  };
}

/**
 * Config params for artifact authentication
 */
export interface ArtifactAuthenticationConfig {
  signingMachineCert: CertPemFile;
  signingMachinePrivateKey: PrivateKeyPemFile | TpmPrivateKey;
  vxCertAuthorityCert: CertPemFile;
}

/**
 * Constructs an artifact authentication config given relevant env vars
 */
export function constructArtifactAuthenticationConfig(): ArtifactAuthenticationConfig {
  const { cert, privateKey } = getMachineCertAndPrivateKey();
  return {
    signingMachineCert: cert,
    signingMachinePrivateKey: privateKey,
    vxCertAuthorityCert: getVxCertAuthorityCert(),
  };
}

/**
 * Config params for a signed hash validation instance
 */
export interface SignedHashValidationConfig {
  machineCert: CertPemFile;
  machinePrivateKey: PrivateKeyPemFile | TpmPrivateKey;
}

/**
 * Constructs a signed hash validation config given relevant env vars
 */
export function constructSignedHashValidationConfig(): SignedHashValidationConfig {
  const { cert, privateKey } = getMachineCertAndPrivateKey();
  return {
    machineCert: cert,
    machinePrivateKey: privateKey,
  };
}

/**
 * Config params for a signed quick results reporting instance
 */
export interface SignedQuickResultsReportingConfig {
  machinePrivateKey: PrivateKeyPemFile | TpmPrivateKey;
}

/**
 * Constructs a signed quick results reporting config given relevant env vars
 */
export function constructSignedQuickResultsReportingConfig(): SignedQuickResultsReportingConfig {
  const { privateKey } = getMachineCertAndPrivateKey();
  return {
    machinePrivateKey: privateKey,
  };
}
