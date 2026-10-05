import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import fs from 'node:fs/promises';
import { STANDARD_CERT_FIELDS } from './certs.js';
import type { PeerTlsConfig } from './config.js';
import { createCert } from './cryptography.js';

/**
 * How long a peer TLS leaf cert is valid. Leaves are re-minted on every boot and before expiry.
 */
export const PEER_TLS_LEAF_EXPIRY_DAYS = 7;

const PEER_TLS_LEAF_COMMON_NAME = 'vx-peer-tls';

/**
 * In-memory TLS credentials for a machine's peer API: an ephemeral key, and a cert chain of the
 * leaf cert for that key followed by the machine cert that signed it.
 */
export interface PeerTlsCredentials {
  readonly key: string;
  readonly cert: string;
  readonly expiresAt: Date;
}

/**
 * Mints a short-lived TLS leaf cert for a freshly generated in-memory key, signed by this
 * machine's cert. Identity is carried by the issuing machine cert, never by the leaf.
 */
export async function mintPeerTlsCredentials(
  config: PeerTlsConfig,
  { expiryInDays = PEER_TLS_LEAF_EXPIRY_DAYS }: { expiryInDays?: number } = {}
): Promise<PeerTlsCredentials> {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const leafCert = await createCert({
    certKeyInput: {
      type: 'public',
      key: {
        source: 'inline',
        content: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    },
    certSubject: `/${[...STANDARD_CERT_FIELDS, `CN=${PEER_TLS_LEAF_COMMON_NAME}`].join('/')}/`,
    certType: 'tls_leaf',
    expiryInDays,
    signingCertAuthorityCertPath: config.machineCertPath,
    signingPrivateKey: config.machinePrivateKey,
  });
  const machineCert = await fs.readFile(config.machineCertPath, 'utf-8');
  const leafCertPem = leafCert.toString('utf-8').trim();
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    cert: `${leafCertPem}\n${machineCert.trim()}\n`,
    expiresAt: new Date(new X509Certificate(leafCertPem).validTo),
  };
}
