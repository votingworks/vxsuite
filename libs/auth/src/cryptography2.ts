// eslint-disable-next-line max-classes-per-file
import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { Stream } from 'node:stream';
import path from 'node:path';

import {
  getConfigFilePath,
  manageOpensslConfig,
  openssl,
} from './cryptography';
import { FileKey, InlineKey, opensslKeyParams, TpmKey } from './keys';
import { runCommand } from './shell';
import { FileSource, MemorySource, PublicKeyApi } from './cryptography3';

const VERIFICATION_TIME_MARGIN_MINUTES = 10;

/**
 * When creating card certs, we use a throwaway private key to create the cert signing request
 * since we can't access/use Java Card private keys for this purpose. We set the cert key using
 * -force_pubkey in this case.
 */
const THROWAWAY_PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBf6X2JisC7M+vYNi2RPaHrDUGPGZxtY5sYszU6RAgsqoAoGCCqGSM49
AwEHoUQDQgAEHAj1wCr6aDNph19ibxPgmkbLTAje0o7XhrQIlmmgFMS06wxaP8NA
6gRPXUxm7gTFKR9PU6lMMBD8FMzmjBC0iA==
-----END EC PRIVATE KEY-----
`;

/**
 * An alias for clarity
 */
type FilePathOrBuffer = string | Buffer;

// interface CryptographicMaterial {
//   asPemFilePathOrContents(): string | Uint8Array;
// }

/** */
export class PublicKey implements PublicKeyApi {
  private readonly pemContents: Uint8Array;
  private readonly pemFilePath?: string;

  constructor(input: { pemContents: Uint8Array; pemFilePath?: string }) {
    this.pemContents = input.pemContents;
    this.pemFilePath = input.pemFilePath;
  }

  static fromPemContents(pemContents: Uint8Array): PublicKey {
    return new PublicKey({ pemContents });
  }

  static async fromDerContents(derContents: Uint8Array): Promise<PublicKey> {
    return new PublicKey({
      pemContents: await openssl([
        'ec',
        '-inform',
        'DER',
        '-outform',
        'PEM',
        '-pubin',
        '-in',
        derContents,
      ]),
    });
  }

  static async fromPemFile(pemFilePath: string): Promise<PublicKey> {
    return new PublicKey({
      pemContents: await fs.readFile(pemFilePath),
      pemFilePath,
    });
  }

  static async fromDerFile(derFilePath: string): Promise<PublicKey> {
    return this.fromDerContents(await fs.readFile(derFilePath));
  }

  asPemFilePathOrContents(): string | Uint8Array {
    return this.pemFilePath ?? this.pemContents;
  }

  async asDerContents(): Promise<Uint8Array> {
    return await openssl([
      'ec',
      '-inform',
      'PEM',
      '-outform',
      'DER',
      '-pubin',
      '-in',
      this,
    ]);
  }

  async verifySignature({
    message,
    messageSignature,
  }: {
    message: Stream;
    messageSignature: Uint8Array;
  }): Promise<void> {
    const params = [
      'dgst',
      '-sha256',
      '-verify',
      this,
      '-signature',
      messageSignature,
    ];
    await openssl(params, { stdin: message });
  }
}

/** */
export class Cert {
  private readonly sourceInternal: FileSource | MemorySource;

  constructor(input: FileSource | MemorySource) {
    this.sourceInternal = input;
  }

  source(): FileSource | MemorySource {
    return this.sourceInternal;
  }

  filePathOrBuffer(): string | Uint8Array {
    if (this.sourceInternal.source === 'file') {
      return this.sourceInternal.path;
    }
    return this.sourceInternal.contents;
  }

  async asDerContents(): Promise<Uint8Array> {
    return await openssl([
      'x509',
      '-inform',
      'PEM',
      '-outform',
      'DER',
      '-in',
      this.filePathOrBuffer(),
    ]);
  }

  async verifyIssuedBy(issuerCert: Cert): Promise<void> {
    const atTime =
      Math.floor(Date.now() / 1000) + VERIFICATION_TIME_MARGIN_MINUTES * 60;
    await openssl([
      'verify',
      // Setting an -attime in the future allows for verification of certs issued on machines with
      // clocks slightly ahead of the current machine's. Such certs would otherwise be temporarily
      // rejected, until the current machine's clock catches up to the cert start time.
      '-attime',
      `${atTime}`,
      // -partial_chain allows for verification without a full cert chain, i.e., a chain of certs that
      // ends with a self-signed cert.
      '-partial_chain',
      '-CAfile',
      issuerCert.pemContents,
      this.pemContents,
    ]);
  }

  async extractPublicKey(): Promise<PublicKeyApi> {
    return new PublicKey({
      pemContents: await openssl([
        'x509',
        '-noout',
        '-pubkey',
        '-in',
        this.pemContents,
      ]),
    });
  }
}

/** */
export class CertSigningRequest {
  private readonly pemContents: Uint8Array;

  constructor(input: { pemContents: Uint8Array }) {
    this.pemContents = input.pemContents;
  }

  asPemContents(): Uint8Array {
    return this.pemContents;
  }
}

/** */
export class PrivateKey {
  private readonly key: FileKey | InlineKey | TpmKey;

  constructor(input: { key: FileKey | InlineKey | TpmKey }) {
    this.key = input.key;
  }

  isTpmKey(): boolean {
    return this.key.source === 'tpm';
  }

  innerKey(): FileKey | InlineKey | TpmKey {
    return this.key;
  }

  async createCertSigningRequest(
    certSubject: string
  ): Promise<CertSigningRequest> {
    const usingTpm = this.key.source === 'tpm';
    return new CertSigningRequest({
      pemContents: await openssl([
        'req',
        '-config',
        getConfigFilePath({ usingTpm }),
        '-new',
        ...opensslKeyParams('-key', this.key),
        '-subj',
        certSubject,
      ]),
    });
  }

  async signMessage(message: Stream): Promise<Uint8Array> {
    const scriptPath = path.join(
      __dirname,
      '../src/intermediate-scripts/sign-message'
    );
    const scriptInput = JSON.stringify({ signingPrivateKey: this.key }); // Handle memory key case
    const inputExcludingMessage = JSON.parse(scriptInput);
    const usingTpm = inputExcludingMessage.signingPrivateKey.source === 'tpm';
    const command = usingTpm
      ? ['sudo', scriptPath, scriptInput]
      : [scriptPath, scriptInput];
    return runCommand(command, { stdin: message });
  }
}

type CertType = 'cert_authority_cert' | 'standard_cert';

/**
 * The input to createCert. All file keys, inline keys, and certs should be in PEM format.
 */
export interface CreateCertInput {
  /**
   * A private key should be provided when possible, but if the private key of the public key to
   * certify isn't available (as is the case for a key pair generated on a Java Card), the public
   * key is also acceptable. We set the cert key using -force_pubkey in this case.
   */
  certKeyInput: PrivateKey | PublicKey;
  certSubject: string;
  certType?: CertType;
  expiryInDays: number;
}

/** */
export class CertAuthority {
  private readonly caCert: Cert;
  private readonly caPrivateKey: PrivateKey;

  constructor(input: { cert: Cert; privateKey: PrivateKey }) {
    this.caCert = input.cert;
    this.caPrivateKey = input.privateKey;
  }

  async createCertGivenCertSigningRequest({
    certPublicKeyOverride,
    certSigningRequest,
    certType = 'standard_cert',
    expiryInDays,
  }: {
    certPublicKeyOverride?: PublicKey;
    certSigningRequest: CertSigningRequest;
    certType?: CertType;
    expiryInDays: number;
  }): Promise<Cert> {
    const usingTpm = this.caPrivateKey.isTpmKey();
    let cert: Uint8Array;
    // Need to use intermediate script
    try {
      // The `openssl x509` command doesn't support the -config flag or OPENSSL_CONF environment
      // variable, so to use the TPM, we have to temporarily swap the default OpenSSL config file. We take
      // great care to restore the default config, using a finally block plus a fallback reset on
      // boot.
      // Note that we tried switching to the `openssl ca` command, which does support the -config
      // flag, but it doesn't support the -force_pubkey flag, which we need for card cert creation
      // because we don't have access to the card private keys nor is there an obvious API for
      // getting the card private keys to sign a CSR.
      if (usingTpm) {
        await manageOpensslConfig('override-for-tpm-use');
      }
      cert = await openssl([
        'x509',
        '-req',
        '-CA',
        this.caCert.asPemContents(),
        ...opensslKeyParams('-CAkey', this.caPrivateKey.innerKey()),
        '-CAcreateserial',
        '-CAserial',
        '/tmp/serial.txt',
        '-in',
        certSigningRequest.asPemContents(),
        '-days',
        `${expiryInDays}`,
        ...(certPublicKeyOverride
          ? ['-force_pubkey', certPublicKeyOverride.asPemContents()]
          : []),
        ...(certType === 'cert_authority_cert'
          ? [
              '-extfile',
              getConfigFilePath({ usingTpm }),
              '-extensions',
              'v3_ca',
            ]
          : []),
      ]);
    } finally {
      if (usingTpm) {
        await manageOpensslConfig('restore-default');
      }
    }
    return new Cert({ pemContents: cert });
  }

  async createCert({
    certKeyInput,
    certSubject,
    certType,
    expiryInDays,
  }: {
    certKeyInput: PrivateKey | PublicKey;
    certSubject: string;
    certType?: CertType;
    expiryInDays: number;
  }): Promise<Cert> {
    const isPrivateKeyOfPublicKeyToCertifyUnavailable =
      certKeyInput instanceof PublicKey;

    const privateKeyOfEntityToCertify: PrivateKey =
      isPrivateKeyOfPublicKeyToCertifyUnavailable
        ? new PrivateKey({
            key: { source: 'inline', content: THROWAWAY_PRIVATE_KEY },
          })
        : certKeyInput;
    const certSigningRequest =
      await privateKeyOfEntityToCertify.createCertSigningRequest(certSubject);

    const certPublicKeyOverride = isPrivateKeyOfPublicKeyToCertifyUnavailable
      ? certKeyInput
      : undefined;
    const cert = await this.createCertGivenCertSigningRequest({
      certPublicKeyOverride,
      certSigningRequest,
      certType,
      expiryInDays,
    });

    return cert;
  }
}
