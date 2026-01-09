import path from 'node:path';
import {
  isIntegrationTest,
  isStagingDeploy,
  isVxDev,
} from '@votingworks/utils';

import { getRequiredEnvVar, isNodeEnvProduction } from './env_vars';
import { RemoteKey } from './keys';
import { Cert, PrivateKey } from './cryptography3';

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
    isNodeEnvProduction() &&
    !isVxDev() &&
    !isIntegrationTest() &&
    !isStagingDeploy()
  );
}
/**
 * Gets the path to the VxCertAuthorityCert
 */
export function getVxCertAuthorityCert(): Cert {
  return new Cert({
    source: 'file',
    path: shouldUseProdCerts()
      ? PROD_VX_CERT_AUTHORITY_CERT_PATH
      : DEV_VX_CERT_AUTHORITY_CERT_PATH,
  });
}

function getMachineCertAndPrivateKey(): {
  cert: Cert;
  privateKey: PrivateKey;
} {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  const machineCertFileName =
    machineType === 'admin' || machineType === 'poll-book'
      ? `vx-${machineType}-cert-authority-cert.pem`
      : `vx-${machineType}-cert.pem`;
  if (shouldUseProdCerts()) {
    const configRoot = getRequiredEnvVar('VX_CONFIG_ROOT');
    return {
      cert: new Cert({
        source: 'file',
        path: path.join(configRoot, machineCertFileName),
      }),
      privateKey: new PrivateKey({ source: 'tpm' }),
    };
  }
  return {
    cert: new Cert({
      source: 'file',
      path: path.join(__dirname, '../certs/dev', machineCertFileName),
    }),
    privateKey: new PrivateKey({
      source: 'file',
      path: path.join(
        __dirname,
        '../certs/dev',
        `vx-${machineType}-private-key.pem`
      ),
    }),
  };
}

interface MachineCardProgrammingConfig {
  configType: 'machine';
  machineCertAuthorityCert: Cert;
  machinePrivateKey: PrivateKey;
}

interface VxCardProgrammingConfig {
  configType: 'vx';
  vxPrivateKey: PrivateKey | RemoteKey;
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
  vxCertAuthorityCert: Cert;

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
          ? { source: 'remote' }
          : new PrivateKey({ source: 'file', path: vxPrivateKeyPath }),
    },
    vxCertAuthorityCert: getVxCertAuthorityCert(),
  };
}

/**
 * Config params for artifact authentication
 */
export interface ArtifactAuthenticationConfig {
  signingMachineCert: Cert;
  signingMachinePrivateKey: PrivateKey;
  vxCertAuthorityCert: Cert;
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
  machineCert: Cert;
  machinePrivateKey: PrivateKey;
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
  machineCert: Cert;
  machinePrivateKey: PrivateKey;
}

/**
 * Constructs a signed quick results reporting config given relevant env vars
 */
export function constructSignedQuickResultsReportingConfig(): SignedQuickResultsReportingConfig {
  const { cert, privateKey } = getMachineCertAndPrivateKey();
  return {
    machineCert: cert,
    machinePrivateKey: privateKey,
  };
}
