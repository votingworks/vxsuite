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
  constructArtifactAuthenticatorConfig,
  ArtifactAuthenticatorConfig,
} from './config';
import { FileKey, TpmKey } from './keys';
import {
  extractPublicKeyFromCert,
  signMessageUsingPrivateKeyFile,
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

interface SignatureFileContents {
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
    const message = await this.constructMessage(artifact);
    const messageSignature = await this.signMessage(message);
    const signingMachineCert = await fs.readFile(this.signingMachineCertPath);
    const signatureFile = this.serializeSignatureFileContents({
      signature: messageSignature,
      signingMachineCert,
    });
    await fs.writeFile(
      this.constructSignatureFilePath(artifact),
      signatureFile
    );
  }

  /**
   * Verifies the authenticity of the provided artifact using its signature file, which is expected
   * to be found at the same file path as the artifact, but with a .vxsig extension, e.g.
   * /path/to/artifact.txt.vxsig.
   */
  async authenticateArtifactUsingSignatureFile(
    artifact: Artifact
  ): Promise<Result<void, Error>> {
    try {
      await this.authenticateArtifactUsingSignatureFileHelper(artifact);
    } catch {
      // TODO: Log raw error
      return err(
        new Error(`Error authenticating ${artifact.path} using signature file`)
      );
    }
    return ok();
  }

  private async authenticateArtifactUsingSignatureFileHelper(
    artifact: Artifact
  ): Promise<void> {
    const message = await this.constructMessage(artifact);

    const signatureFile = await fs.readFile(
      this.constructSignatureFilePath(artifact)
    );
    const { signature: messageSignature, signingMachineCert } =
      this.deserializeSignatureFileContents(signatureFile);

    // Verify type and authenticity of signing machine cert
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

    const signingMachinePublicKey = await extractPublicKeyFromCert(
      signingMachineCert
    );
    await verifySignature({
      message,
      messageSignature,
      publicKey: signingMachinePublicKey,
    });
  }

  private serializeSignatureFileContents(
    signatureFileContents: SignatureFileContents
  ): Buffer {
    const { signature, signingMachineCert } = signatureFileContents;
    return Buffer.concat([
      Buffer.from([signature.length]),
      signature,
      signingMachineCert,
    ]);
  }

  private deserializeSignatureFileContents(
    file: Buffer
  ): SignatureFileContents {
    const signatureLength = file[0];
    assert(signatureLength !== undefined);
    const signature = file.subarray(1, signatureLength + 1);
    const signingMachineCert = file.subarray(signatureLength + 1);
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
    switch (this.signingMachinePrivateKey.source) {
      case 'file': {
        return await signMessageUsingPrivateKeyFile({
          message,
          privateKey: this.signingMachinePrivateKey.path,
        });
      }
      /* istanbul ignore next */
      case 'tpm': {
        // TODO: Move TPM signing script from vxsuite-complete-system to vxsuite and call here
        return Buffer.from([]);
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(this.signingMachinePrivateKey, 'source');
      }
    }
  }

  private constructSignatureFilePath(artifact: Artifact) {
    return `${artifact.path}.vxsig`;
  }
}
