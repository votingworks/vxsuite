import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  assert,
  err,
  extractErrorMessage,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadataSchema,
  safeParseJson,
} from '@votingworks/types';
import { parseCastVoteRecordReportExportDirectoryName } from '@votingworks/utils';

import CombinedStream from 'combined-stream';
import { computeCastVoteRecordRootHashFromScratch } from './cast_vote_record_hashes';
import { MachineCustomCertFields, parseCert } from './certs';
import {
  ArtifactAuthenticationConfig,
  constructArtifactAuthenticationConfig,
} from './config';
import {
  extractPublicKeyFromCert,
  signMessage,
  verifyFirstCertWasSignedBySecondCert,
  verifySignature,
} from './cryptography';
import { constructPrefixedMessage } from './signatures';

/**
 * The file extension for VotingWorks signature files
 */
export const SIGNATURE_FILE_EXTENSION = '.vxsig';

interface CastVoteRecordsToExport {
  type: 'cast_vote_records';
  context: 'export';
  directoryName: string;
  metadataFileContents: string;
}

interface CastVoteRecordsToImport {
  type: 'cast_vote_records';
  context: 'import';
  directoryPath: string;
}

type CastVoteRecords = CastVoteRecordsToExport | CastVoteRecordsToImport;

interface ElectionPackage {
  type: 'election_package';
  filePath: string;
}

/**
 * An export-time representation of an {@link Artifact}
 */
export type ArtifactToExport = CastVoteRecordsToExport | ElectionPackage;

/**
 * An import-time representation of an {@link Artifact}
 */
export type ArtifactToImport = CastVoteRecordsToImport | ElectionPackage;

/**
 * A machine-exported artifact whose authenticity we want to be able to verify
 */
export type Artifact = CastVoteRecords | ElectionPackage;

interface ArtifactSignatureBundle {
  signature: Buffer;
  signingMachineCert: Buffer;
}

//
// Helpers
//

function constructMessage(artifact: Artifact): {
  artifactStream: Readable;
  message: CombinedStream;
} {
  switch (artifact.type) {
    case 'cast_vote_records': {
      let metadataFileContents: Readable;
      switch (artifact.context) {
        case 'export': {
          metadataFileContents = Readable.from(artifact.metadataFileContents);
          break;
        }
        case 'import': {
          metadataFileContents = createReadStream(
            path.join(
              artifact.directoryPath,
              CastVoteRecordExportFileName.METADATA
            )
          );
          break;
        }
        /* istanbul ignore next: Compile-time check for completeness - @preserve */
        default: {
          throwIllegalValue(artifact, 'context');
        }
      }
      return {
        artifactStream: metadataFileContents,
        message: constructPrefixedMessage(artifact.type, metadataFileContents),
      };
    }
    case 'election_package': {
      const fileContents = createReadStream(artifact.filePath);
      return {
        artifactStream: fileContents,
        message: constructPrefixedMessage(artifact.type, fileContents),
      };
    }
    /* istanbul ignore next: Compile-time check for completeness - @preserve */
    default: {
      throwIllegalValue(artifact, 'type');
    }
  }
}

async function constructArtifactSignatureBundle(
  config: ArtifactAuthenticationConfig,
  artifact: Artifact
): Promise<ArtifactSignatureBundle> {
  const { message } = constructMessage(artifact);
  const messageSignature = await signMessage({
    message,
    signingPrivateKey: config.signingMachinePrivateKey,
  });
  const signingMachineCert = await fs.readFile(config.signingMachineCertPath);
  return { signature: messageSignature, signingMachineCert };
}

function serializeArtifactSignatureBundle(
  artifactSignatureBundle: ArtifactSignatureBundle
): Buffer {
  const { signature, signingMachineCert } = artifactSignatureBundle;
  return Buffer.concat([
    // ECC signature length can vary ever so slightly, hence the need to persist length metadata
    Buffer.of(signature.length),
    signature,
    signingMachineCert,
  ]);
}

function deserializeArtifactSignatureBundle(
  buffer: Buffer
): ArtifactSignatureBundle {
  assert(
    buffer.length >= 500, // A conservative lower bound
    'Buffer is too small to reasonably contain an artifact signature bundle'
  );
  const signatureLength = buffer[0];
  assert(signatureLength !== undefined);
  assert(
    signatureLength >= 60 && signatureLength <= 72,
    `Signature length should be between 60 and 72, received ${signatureLength}`
  );
  const signature = buffer.subarray(1, signatureLength + 1);
  const signingMachineCert = buffer.subarray(signatureLength + 1);
  return { signature, signingMachineCert };
}

/**
 * Throws an error if validation fails
 */
async function validateSigningMachineCert(
  config: ArtifactAuthenticationConfig,
  signingMachineCert: Buffer
): Promise<MachineCustomCertFields> {
  await verifyFirstCertWasSignedBySecondCert(
    signingMachineCert,
    config.vxCertAuthorityCertPath
  );
  const signingMachineCertDetails = await parseCert(signingMachineCert);
  assert(signingMachineCertDetails.component !== 'card');
  return signingMachineCertDetails;
}

/**
 * Throws an error if artifact authentication fails
 */
async function authenticateArtifactUsingArtifactSignatureBundle(
  config: ArtifactAuthenticationConfig,
  artifact: ArtifactToImport,
  artifactSignatureBundle: ArtifactSignatureBundle
): Promise<MachineCustomCertFields> {
  const { artifactStream, message } = constructMessage(artifact);
  try {
    const { signature: messageSignature, signingMachineCert } =
      artifactSignatureBundle;
    const signingMachineCertDetails = await validateSigningMachineCert(
      config,
      signingMachineCert
    );
    const signingMachinePublicKey =
      await extractPublicKeyFromCert(signingMachineCert);
    await verifySignature({
      message,
      messageSignature,
      publicKey: signingMachinePublicKey,
    });
    return signingMachineCertDetails;
  } finally {
    // If authentication fails, we still need to destroy the message stream
    // to avoid keeping an open file handle, which would prevent the USB drive
    // holding the file from being unmounted.
    artifactStream.destroy();
  }
}

function constructSignatureFileName(artifact: ArtifactToExport): string {
  switch (artifact.type) {
    case 'cast_vote_records': {
      return `${artifact.directoryName}${SIGNATURE_FILE_EXTENSION}`;
    }
    case 'election_package': {
      return `${path.basename(artifact.filePath)}${SIGNATURE_FILE_EXTENSION}`;
    }
    /* istanbul ignore next: Compile-time check for completeness - @preserve */
    default: {
      throwIllegalValue(artifact, 'type');
    }
  }
}

function constructSignatureFilePath(artifact: ArtifactToImport): string {
  switch (artifact.type) {
    case 'cast_vote_records': {
      return `${artifact.directoryPath}${SIGNATURE_FILE_EXTENSION}`;
    }
    case 'election_package': {
      return `${artifact.filePath}${SIGNATURE_FILE_EXTENSION}`;
    }
    /* istanbul ignore next: Compile-time check for completeness - @preserve */
    default: {
      throwIllegalValue(artifact, 'type');
    }
  }
}

async function performArtifactSpecificAuthenticationChecks(
  artifact: ArtifactToImport,
  signingMachineCertDetails: MachineCustomCertFields
): Promise<void> {
  switch (artifact.type) {
    case 'cast_vote_records': {
      assert(
        signingMachineCertDetails.component === 'central-scan' ||
          signingMachineCertDetails.component === 'scan',
        'Signing machine for cast vote records should be a VxCentralScan or VxScan'
      );

      const exportDirectoryName = path.basename(artifact.directoryPath);
      const exportDirectoryNameComponents =
        parseCastVoteRecordReportExportDirectoryName(exportDirectoryName);
      assert(
        exportDirectoryNameComponents !== undefined,
        `Error parsing export directory name: ${exportDirectoryName}`
      );
      assert(
        exportDirectoryNameComponents.machineId ===
          signingMachineCertDetails.machineId,
        `Machine ID in export directory name doesn't match machine ID in signing machine cert: ` +
          `${exportDirectoryNameComponents.machineId} != ${signingMachineCertDetails.machineId}`
      );

      const metadataFileContents = await fs.readFile(
        path.join(
          artifact.directoryPath,
          CastVoteRecordExportFileName.METADATA
        ),
        'utf-8'
      );
      const parseResult = safeParseJson(
        metadataFileContents,
        CastVoteRecordExportMetadataSchema
      );
      assert(
        parseResult.isOk(),
        `Error parsing metadata file: ${parseResult.err()?.message}`
      );
      const metadata = parseResult.ok();

      const castVoteRecordRootHash =
        await computeCastVoteRecordRootHashFromScratch(artifact.directoryPath);
      assert(
        metadata.castVoteRecordRootHash === castVoteRecordRootHash,
        `Cast vote record root hash in metadata file doesn't match recomputed hash: ` +
          `${metadata.castVoteRecordRootHash} != ${castVoteRecordRootHash}`
      );

      const scannerIds = metadata.batchManifest.map((batch) => batch.scannerId);
      for (const scannerId of scannerIds) {
        assert(
          scannerId === signingMachineCertDetails.machineId,
          `Scanner ID in metadata file doesn't match machine ID in signing machine cert: ` +
            `${scannerId} != ${signingMachineCertDetails.machineId}`
        );
      }

      break;
    }

    case 'election_package': {
      assert(
        signingMachineCertDetails.component === 'admin',
        'Signing machine for election package should be a VxAdmin'
      );
      break;
    }

    /* istanbul ignore next: Compile-time check for completeness - @preserve */
    default: {
      throwIllegalValue(artifact, 'type');
    }
  }
}

//
// Exported functions
//

/**
 * Prepares a signature file for the provided artifact that can later be used to verify the
 * artifact's authenticity. The consumer is responsible for actually writing the file. The file
 * should be written adjacent to the artifact, with the returned file name.
 */
export async function prepareSignatureFile(
  artifact: ArtifactToExport,
  configOverride?: ArtifactAuthenticationConfig
): Promise<{ fileContents: Buffer; fileName: string }> {
  const config =
    configOverride ??
    /* istanbul ignore next - @preserve */ constructArtifactAuthenticationConfig();
  const artifactSignatureBundle = await constructArtifactSignatureBundle(
    config,
    artifact
  );
  return {
    fileContents: serializeArtifactSignatureBundle(artifactSignatureBundle),
    fileName: constructSignatureFileName(artifact),
  };
}

/**
 * Verifies the authenticity of the provided artifact using its signature file, which is expected
 * to be found at the same file path as the artifact, but with a .vxsig extension, e.g.
 * /path/to/artifact.txt.vxsig. Returns an error Result if artifact authentication fails.
 */
export async function authenticateArtifactUsingSignatureFile(
  artifact: ArtifactToImport,
  configOverride?: ArtifactAuthenticationConfig
): Promise<Result<void, Error>> {
  const config =
    configOverride ??
    /* istanbul ignore next - @preserve */ constructArtifactAuthenticationConfig();
  try {
    const signatureFilePath = constructSignatureFilePath(artifact);
    const artifactSignatureBundle = deserializeArtifactSignatureBundle(
      await fs.readFile(signatureFilePath)
    );
    const machineDetails =
      await authenticateArtifactUsingArtifactSignatureBundle(
        config,
        artifact,
        artifactSignatureBundle
      );
    await performArtifactSpecificAuthenticationChecks(artifact, machineDetails);
  } catch (error) {
    const artifactSummary = JSON.stringify(artifact);
    const errorMessage = extractErrorMessage(error);
    return err(
      new Error(
        `Error authenticating ${artifactSummary} using signature file: ${errorMessage}`
      )
    );
  }
  return ok();
}
