/* eslint-disable vx/gts-jsdoc */
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import { z } from 'zod';

//
// Types
//

/**
 * A cert consists of a public key plus some attributes, bundled and digitally signed.
 * A cert signing request is a request for a cert.
 * A private key is used to digitally sign data for verification by the corresponding public key.
 * A public key is used to verify data digitally signed by the corresponding private key.
 */
type CryptographicMaterialType =
  | 'cert'
  | 'cert_signing_request'
  | 'private_key'
  | 'public_key';

/**
 * DER is binary format for cryptographic data.
 * PEM is a base64 ASCII format for cryptographic data.
 *
 */
type CryptographicMaterialFormat = 'der' | 'pem';

/**
 * Cryptographic material stored in memory
 */
interface CryptographicBuffer<
  T extends CryptographicMaterialType,
  F extends CryptographicMaterialFormat,
> {
  type: T;
  format: F;
  source: 'buffer';
  content: Buffer;
}

/**
 * Cryptographic material stored in a file
 */
interface CryptographicFile<
  T extends CryptographicMaterialType,
  F extends CryptographicMaterialFormat,
> {
  type: T;
  format: F;
  source: 'file';
  path: string;
}

export type CertDerBuffer = CryptographicBuffer<'cert', 'der'>;
export type CertDerFile = CryptographicFile<'cert', 'der'>;
export type CertPemBuffer = CryptographicBuffer<'cert', 'pem'>;
export type CertPemFile = CryptographicFile<'cert', 'pem'>;

export type CertSigningRequestDerBuffer = CryptographicBuffer<
  'cert_signing_request',
  'der'
>;
export type CertSigningRequestDerFile = CryptographicFile<
  'cert_signing_request',
  'der'
>;
export type CertSigningRequestPemBuffer = CryptographicBuffer<
  'cert_signing_request',
  'pem'
>;
export type CertSigningRequestPemFile = CryptographicFile<
  'cert_signing_request',
  'pem'
>;

export type PrivateKeyDerBuffer = CryptographicBuffer<'private_key', 'der'>;
export type PrivateKeyDerFile = CryptographicFile<'private_key', 'der'>;
export type PrivateKeyPemBuffer = CryptographicBuffer<'private_key', 'pem'>;
export type PrivateKeyPemFile = CryptographicFile<'private_key', 'pem'>;

export type PublicKeyDerBuffer = CryptographicBuffer<'public_key', 'der'>;
export type PublicKeyDerFile = CryptographicFile<'public_key', 'der'>;
export type PublicKeyPemBuffer = CryptographicBuffer<'public_key', 'pem'>;
export type PublicKeyPemFile = CryptographicFile<'public_key', 'pem'>;

export const remotePrivateKey = {
  type: 'private_key',
  source: 'remote',
} as const;

/**
 * A private key in someone else's possession
 */
export type RemotePrivateKey = typeof remotePrivateKey;

export const tpmPrivateKey = {
  type: 'private_key',
  source: 'tpm',
} as const;

/**
 * A private key in a Trusted Platform Module (TPM), i.e., a hardware-based security
 * chip
 */
export type TpmPrivateKey = typeof tpmPrivateKey;

//
// Helper functions
//

function cryptographicBuffer<
  T extends CryptographicMaterialType,
  F extends CryptographicMaterialFormat,
>(type: T, format: F, content: Buffer): CryptographicBuffer<T, F> {
  return {
    type,
    format,
    source: 'buffer',
    content,
  };
}

function cryptographicFile<
  T extends CryptographicMaterialType,
  F extends CryptographicMaterialFormat,
>(type: T, format: F, path: string): CryptographicFile<T, F> {
  return {
    type,
    format,
    source: 'file',
    path,
  };
}

export function derBuffer<T extends CryptographicMaterialType>(
  type: T,
  content: Buffer
): CryptographicBuffer<T, 'der'> {
  return cryptographicBuffer(type, 'der', content);
}

export function pemBuffer<T extends CryptographicMaterialType>(
  type: T,
  content: Buffer
): CryptographicBuffer<T, 'pem'> {
  return cryptographicBuffer(type, 'pem', content);
}

export function derFile<T extends CryptographicMaterialType>(
  type: T,
  path: string
): CryptographicFile<T, 'der'> {
  return cryptographicFile(type, 'der', path);
}

export function pemFile<T extends CryptographicMaterialType>(
  type: T,
  path: string
): CryptographicFile<T, 'pem'> {
  return cryptographicFile(type, 'pem', path);
}

export async function cryptographicBufferToFile<
  T extends CryptographicMaterialType,
  F extends CryptographicMaterialFormat,
>(
  input: CryptographicBuffer<T, F>,
  filePath: string
): Promise<CryptographicFile<T, F>> {
  await fs.writeFile(filePath, input.content);
  return cryptographicFile(input.type, input.format, filePath);
}

export async function cryptographicFileToBuffer<
  T extends CryptographicMaterialType,
  F extends CryptographicMaterialFormat,
>(input: CryptographicFile<T, F>): Promise<CryptographicBuffer<T, F>> {
  const content = await fs.readFile(input.path);
  return cryptographicBuffer(input.type, input.format, content);
}

export function pathOrContent<
  T extends CryptographicMaterialType,
  F extends CryptographicMaterialFormat,
>(
  cryptographicMaterial: CryptographicBuffer<T, F> | CryptographicFile<T, F>
): string | Buffer {
  return cryptographicMaterial.source === 'file'
    ? cryptographicMaterial.path
    : cryptographicMaterial.content;
}

//
// For miscellaneous JSON serializing needs
//

export const CertPemFileSchema: z.ZodSchema<CertPemFile> = z.object({
  type: z.literal('cert'),
  format: z.literal('pem'),
  source: z.literal('file'),
  path: z.string(),
});

export const PrivateKeyPemFileSchema: z.ZodSchema<PrivateKeyPemFile> = z.object(
  {
    type: z.literal('private_key'),
    format: z.literal('pem'),
    source: z.literal('file'),
    path: z.string(),
  }
);

export const PublicKeyPemFileSchema: z.ZodSchema<PublicKeyPemFile> = z.object({
  type: z.literal('public_key'),
  format: z.literal('pem'),
  source: z.literal('file'),
  path: z.string(),
});

export const TpmPrivateKeySchema: z.ZodSchema<TpmPrivateKey> = z.object({
  type: z.literal('private_key'),
  source: z.literal('tpm'),
});

export type PublicKeyPemString = Omit<
  PublicKeyPemBuffer,
  'source' | 'content'
> & {
  source: 'string';
  content: string;
};

export const PublicKeyPemStringSchema: z.ZodSchema<PublicKeyPemString> =
  z.object({
    type: z.literal('public_key'),
    format: z.literal('pem'),
    source: z.literal('string'),
    content: z.string(),
  });

export function publicKeyPemBufferToString(
  publicKeyPemBuffer: PublicKeyPemBuffer
): PublicKeyPemString {
  return {
    ...publicKeyPemBuffer,
    source: 'string',
    content: publicKeyPemBuffer.content.toString('utf-8'),
  };
}

export function publicKeyPemStringToBuffer(
  publicKeyPemString: PublicKeyPemString
): PublicKeyPemBuffer {
  const content = Buffer.from(publicKeyPemString.content, 'utf-8');
  return pemBuffer('public_key', content);
}
