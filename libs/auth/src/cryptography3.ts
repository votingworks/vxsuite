/* eslint-disable max-classes-per-file */
import { Stream } from 'node:stream';
import fs from 'node:fs/promises';
import { asBoolean } from '@votingworks/utils';
import { throwIllegalValue } from '@votingworks/basics';
import { getConfigFilePath, openssl } from './cryptography';

const VERIFICATION_TIME_MARGIN_MINUTES = 10;

/**
 * The ID of the TPM key used for auth operations
 */
const TPM_KEY_ID = '0x81000001';

/**
 * The ID of the TPM key used to secure strongSwan on VxPollBook
 */
const STRONGSWAN_TPM_KEY_ID = '0x81010003';

/**
 * The name of the OpenSSL provider that we're using to interface with the TPM
 */
const TPM_OPENSSL_PROVIDER = 'tpm2';

/** */
export interface FileSource {
  source: 'file';
  path: string;
}

/** */
export interface MemorySource {
  source: 'memory';
  contents: Uint8Array;
}

/** */
export interface TpmSource {
  source: 'tpm';
}

/** */
export class PublicKey {
  private readonly source: FileSource | MemorySource;

  constructor(input: FileSource | MemorySource) {
    this.source = input;
  }

  filePathOrContents(): string | Uint8Array {
    return this.source.source === 'file'
      ? this.source.path
      : this.source.contents;
  }

  async verifySignature(input: {
    message: Stream;
    messageSignature: Uint8Array;
  }): Promise<void> {
    const params = [
      'dgst',
      '-sha256',
      '-verify',
      this.filePathOrContents(),
      '-signature',
      input.messageSignature,
    ];
    await openssl(params, { stdin: input.message });
  }
}

/** */
export class Cert {
  private readonly source: FileSource | MemorySource;

  constructor(input: FileSource | MemorySource) {
    this.source = input;
  }

  static async fromDerContents(derContents: Uint8Array): Promise<Cert> {
    const pemContents = await openssl([
      'x509',
      '-inform',
      'PEM',
      '-outform',
      'DER',
      '-in',
      derContents,
    ]);
    return new Cert({ source: 'memory', contents: pemContents });
  }

  filePathOrContents(): string | Uint8Array {
    return this.source.source === 'file'
      ? this.source.path
      : this.source.contents;
  }

  contents(): Promise<Uint8Array> {
    return this.source.source === 'file'
      ? fs.readFile(this.source.path)
      : Promise.resolve(this.source.contents);
  }

  async asDerContents(): Promise<Uint8Array> {
    const derContents = await openssl([
      'x509',
      '-inform',
      'PEM',
      '-outform',
      'DER',
      '-in',
      this.filePathOrContents(),
    ]);
    return derContents;
  }

  async extractPublicKey(): Promise<PublicKey> {
    const pemContents = await openssl([
      'x509',
      '-noout',
      '-pubkey',
      '-in',
      this.filePathOrContents(),
    ]);
    return new PublicKey({ source: 'memory', contents: pemContents });
  }

  async verifyIssuedBy(cert: Cert): Promise<void> {
    const atTime =
      Math.floor(Date.now() / 1000) + VERIFICATION_TIME_MARGIN_MINUTES * 60;
    await openssl([
      'verify',
      // Setting an -attime in the future allows for verification of certs issued on machines with
      // clocks slightly ahead of the current machine's. Such certs would otherwise be temporarily
      // rejected, until the current machine's clock catches up to the cert start time.
      '-attime',
      `${atTime}`,
      // -partial_chain allows for verification without a full cert chain, i.e., a chain of certs
      // that ends with a self-signed cert.
      '-partial_chain',
      '-CAfile',
      cert.filePathOrContents(),
      this.filePathOrContents(),
    ]);
  }
}

/** */
export class CertSigningRequest {
  private readonly source: FileSource | MemorySource;

  constructor(input: FileSource | MemorySource) {
    this.source = input;
  }

  filePathOrContents(): string | Uint8Array {
    return this.source.source === 'file'
      ? this.source.path
      : this.source.contents;
  }
}

/** */
export class PrivateKey {
  private readonly source: FileSource | TpmSource;

  constructor(input: FileSource | TpmSource) {
    this.source = input;
  }

  isTpmKey(): boolean {
    return this.source.source === 'tpm';
  }

  private opensslKeyParams(opensslParam: string): Array<string | Uint8Array> {
    switch (this.source.source) {
      case 'file': {
        return [opensslParam, this.source.path];
      }
      case 'tpm': {
        const tpmKeyId = asBoolean(process.env.USE_STRONGSWAN_TPM_KEY)
          ? STRONGSWAN_TPM_KEY_ID
          : TPM_KEY_ID;
        return [
          opensslParam,
          `handle:${tpmKeyId}`,
          // This propquery tells OpenSSL to prefer the TPM provider but fall back to the default
          // provider for operations outside the scope of the TPM provider, like reading files.
          '-propquery',
          `?provider=${TPM_OPENSSL_PROVIDER}`,
        ];
      }
      /* istanbul ignore next: Compile-time check for completeness - @preserve */
      default: {
        throwIllegalValue(this.source, 'source');
      }
    }
  }

  async createCertSigningRequest(
    certSubject: string
  ): Promise<CertSigningRequest> {
    const pemContents = await openssl([
      'req',
      '-config',
      getConfigFilePath({ usingTpm: this.isTpmKey() }),
      '-new',
      ...this.opensslKeyParams('-key'),
      '-subj',
      certSubject,
    ]);
    return new CertSigningRequest({ source: 'memory', contents: pemContents });
  }

  async signMessage(message: Stream): Promise<Uint8Array> {
    // eslint-disable-next-line no-console
    console.log(message);
    return Promise.resolve(Uint8Array.from([]));
  }
}

type CertType = 'cert_authority_cert' | 'standard_cert';

/** */
export class CertAuthority {
  private readonly cert: Cert;
  private readonly privateKey: PrivateKey;

  constructor(input: { cert: Cert; privateKey: PrivateKey }) {
    this.cert = input.cert;
    this.privateKey = input.privateKey;
  }

  async createCertGivenCertSigningRequest(input: {
    certPublicKeyOverride?: PublicKey;
    certSigningRequest: CertSigningRequest;
    certType?: CertType;
    expiryInDays: number;
  }): Promise<Cert> {
    // eslint-disable-next-line no-console
    console.log(input);
    return Promise.resolve(new Cert({ source: 'file', path: '' }));
  }

  async createCert(input: {
    certKeyInput: PrivateKey | PublicKey;
    certSubject: string;
    certType?: CertType;
    expiryInDays: number;
  }): Promise<Cert> {
    // eslint-disable-next-line no-console
    console.log(input);
    return Promise.resolve(new Cert({ source: 'file', path: '' }));
  }
}
