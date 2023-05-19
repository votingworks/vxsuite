import { Buffer } from 'buffer';
import fs from 'fs/promises';
import {
  assert,
  err,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';

import { parseCert } from './certs';
import {
  ArtifactAuthenticatorConfig,
  constructArtifactAuthenticatorConfig,
} from './config';
import { FileKey, TpmKey } from './keys';
import {
  extractPublicKeyFromCert,
  signMessageUsingPrivateKey,
  verifyFirstCertWasSignedBySecondCert,
  verifySignature,
} from './openssl';

/**
 * A machine-exported artifact whose authenticity we want to be able to verify
 */
export interface Artifact {
  type: 'cvr_file' | 'election_definition';
  path: string;
}

interface ArtifactSignatureBundle {
  signature: Buffer;
  signingMachineCert: Buffer;
}

/**
 * An artifact authenticator that uses digital signatures to verify the authenticity of
 * machine-exported artifacts, meeting VVSG2 data protection requirements
 */
export class ArtifactAuthenticator {
  private readonly signingMachineCertPath: string;
  private readonly signingMachinePrivateKey: FileKey | TpmKey;
  private readonly vxCertAuthorityCertPath: string;

  constructor(
    // Support specifying a custom config for tests
    /* istanbul ignore next */
    input: ArtifactAuthenticatorConfig = constructArtifactAuthenticatorConfig()
  ) {
    this.signingMachineCertPath = input.signingMachineCertPath;
    this.signingMachinePrivateKey = input.signingMachinePrivateKey;
    this.vxCertAuthorityCertPath = input.vxCertAuthorityCertPath;
  }

  /**
   * Writes a signature file for the provided artifact that can later be used to verify the
   * artifact's authenticity. The signature file is written to the same file path as the artifact,
   * but with a .vxsig extension, e.g. /path/to/artifact.txt.vxsig.
   */
  async writeSignatureFile(artifact: Artifact): Promise<void> {
    const artifactSignatureBundle = await this.constructArtifactSignatureBundle(
      artifact
    );
    await fs.writeFile(
      this.constructSignatureFilePath(artifact),
      this.serializeArtifactSignatureBundle(artifactSignatureBundle)
    );
  }

  /**
   * Verifies the authenticity of the provided artifact using its signature file, which is expected
   * to be found at the same file path as the artifact, but with a .vxsig extension, e.g.
   * /path/to/artifact.txt.vxsig. Returns an error Result if artifact authentication fails.
   */
  async authenticateArtifactUsingSignatureFile(
    artifact: Artifact
  ): Promise<Result<void, Error>> {
    try {
      const artifactSignatureBundle = this.deserializeArtifactSignatureBundle(
        await fs.readFile(this.constructSignatureFilePath(artifact))
      );
      await this.authenticateArtifactUsingArtifactSignatureBundle(
        artifact,
        artifactSignatureBundle
      );
    } catch {
      // TODO: Log raw error
      return err(
        new Error(`Error authenticating ${artifact.path} using signature file`)
      );
    }
    return ok();
  }

  private async constructArtifactSignatureBundle(
    artifact: Artifact
  ): Promise<ArtifactSignatureBundle> {
    const message = await this.constructMessage(artifact);
    const messageSignature = await this.signMessage(message);
    const signingMachineCert = await fs.readFile(this.signingMachineCertPath);
    return { signature: messageSignature, signingMachineCert };
  }

  /**
   * Throws an error if artifact authentication fails
   */
  private async authenticateArtifactUsingArtifactSignatureBundle(
    artifact: Artifact,
    artifactSignatureBundle: ArtifactSignatureBundle
  ): Promise<void> {
    const message = await this.constructMessage(artifact);
    const { signature: messageSignature, signingMachineCert } =
      artifactSignatureBundle;
    await this.validateSigningMachineCert(signingMachineCert, artifact);
    const signingMachinePublicKey = await extractPublicKeyFromCert(
      signingMachineCert
    );
    await verifySignature({
      message,
      messageSignature,
      publicKey: signingMachinePublicKey,
    });
  }

  /**
   * Throws an error if validation fails
   */
  private async validateSigningMachineCert(
    signingMachineCert: Buffer,
    artifact: Artifact
  ): Promise<void> {
    const certDetails = await parseCert(signingMachineCert);
    switch (artifact.type) {
      case 'cvr_file': {
        assert(
          certDetails.component === 'central-scan' ||
            certDetails.component === 'scan',
          'Signing machine cert for CVR file should be a VxCentralScan or VxScan cert'
        );
        break;
      }
      case 'election_definition': {
        assert(
          certDetails.component === 'admin',
          'Signing machine cert for election definition should be a VxAdmin cert'
        );
        break;
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(artifact.type);
      }
    }
    await verifyFirstCertWasSignedBySecondCert(
      signingMachineCert,
      this.vxCertAuthorityCertPath
    );
  }

  private serializeArtifactSignatureBundle(
    artifactSignatureBundle: ArtifactSignatureBundle
  ): Buffer {
    const { signature, signingMachineCert } = artifactSignatureBundle;
    return Buffer.concat([
      // ECC signature length can vary ever so slightly, hence the need to persist length metadata
      Buffer.from([signature.length]),
      signature,
      signingMachineCert,
    ]);
  }

  private deserializeArtifactSignatureBundle(
    buffer: Buffer
  ): ArtifactSignatureBundle {
    assert(
      buffer.length >= 500, // A conservative lower bound
      'Buffer is too small to reasonably contain an artifact signature bundle'
    );
    const signatureLength = buffer[0];
    assert(signatureLength !== undefined);
    assert(
      signatureLength >= 70 && signatureLength <= 72,
      `Signature length should be between 70 and 72, received ${signatureLength}`
    );
    const signature = buffer.subarray(1, signatureLength + 1);
    const signingMachineCert = buffer.subarray(signatureLength + 1);
    return { signature, signingMachineCert };
  }

  private async constructMessage(artifact: Artifact): Promise<Buffer> {
    const messageFormatVersion = Buffer.from('1', 'utf-8');
    const separator = Buffer.from('//', 'utf-8');
    const fileType = Buffer.from(artifact.type, 'utf-8');
    const fileContents = await fs.readFile(artifact.path);
    return Buffer.concat([
      messageFormatVersion,
      separator,
      fileType,
      separator,
      fileContents,
    ]);
  }

  private async signMessage(message: Buffer): Promise<Buffer> {
    return await signMessageUsingPrivateKey({
      message,
      privateKey: this.signingMachinePrivateKey,
    });
  }

  private constructSignatureFilePath(artifact: Artifact): string {
    return `${artifact.path}.vxsig`;
  }
}
