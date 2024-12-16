import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { dirSync } from 'tmp';
import { z } from 'zod';
import { assert, ok } from '@votingworks/basics';
import {
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CVR,
  DEV_MACHINE_ID,
} from '@votingworks/types';

import { getTestFilePath } from '../test/utils';
import {
  ArtifactToExport,
  ArtifactToImport,
  authenticateArtifactUsingSignatureFile,
  prepareSignatureFile,
  SIGNATURE_FILE_EXTENSION,
} from './artifact_authentication';
import { ArtifactAuthenticationConfig } from './config';

vi.mock(
  '@votingworks/types',
  async (importActual): Promise<typeof import('@votingworks/types')> => ({
    ...(await importActual<typeof import('@votingworks/types')>()),
    // Avoid having to prepare a complete CastVoteRecordExportMetadata object
    CastVoteRecordExportMetadataSchema: z.any(),
  })
);

/**
 * The root hash for the mock cast vote records created in the beforeEach block
 */
const expectedCastVoteRecordRootHash =
  '234cfef0955757cb9d06bd48c5dea8885ad96174225012ae311fe548e53b8fcf';

const cvrId1 = 'a1234567-0000-0000-0000-000000000000';
const cvrId2 = 'a2345678-0000-0000-0000-000000000000';
const cvrId3 = 'a3456789-0000-0000-0000-000000000000';

let tempDirectoryPath: string;
let castVoteRecords: {
  artifactToExport: ArtifactToExport;
  artifactToImport: ArtifactToImport;
};
let electionPackage: {
  artifactToExport: ArtifactToExport;
  artifactToImport: ArtifactToImport;
};

beforeEach(() => {
  tempDirectoryPath = dirSync().name;

  // Prepare mock cast vote records
  const castVoteRecordExportDirectoryPath = path.join(
    tempDirectoryPath,
    `machine_${DEV_MACHINE_ID}__2024-01-01_00-00-00`
  );
  fs.mkdirSync(castVoteRecordExportDirectoryPath);
  for (const { cvrId, cvrReportContents } of [
    { cvrId: cvrId1, cvrReportContents: 'a' },
    { cvrId: cvrId2, cvrReportContents: 'b' },
  ]) {
    fs.mkdirSync(path.join(castVoteRecordExportDirectoryPath, cvrId));
    fs.writeFileSync(
      path.join(
        castVoteRecordExportDirectoryPath,
        cvrId,
        CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
      ),
      cvrReportContents
    );
  }
  const castVoteRecordExportMetadata: CastVoteRecordExportMetadata = {
    arePollsClosed: true,
    castVoteRecordReportMetadata: {
      ReportGeneratingDeviceIds: [DEV_MACHINE_ID],
    } as unknown as CVR.CastVoteRecordReport,
    castVoteRecordRootHash: expectedCastVoteRecordRootHash,
    batchManifest: [],
  };
  fs.writeFileSync(
    path.join(
      castVoteRecordExportDirectoryPath,
      CastVoteRecordExportFileName.METADATA
    ),
    JSON.stringify(castVoteRecordExportMetadata)
  );
  castVoteRecords = {
    artifactToExport: {
      type: 'cast_vote_records',
      context: 'export',
      directoryName: path.basename(castVoteRecordExportDirectoryPath),
      metadataFileContents: JSON.stringify(castVoteRecordExportMetadata),
    },
    artifactToImport: {
      type: 'cast_vote_records',
      context: 'import',
      directoryPath: castVoteRecordExportDirectoryPath,
    },
  };

  // Prepare mock election package
  const electionPackagePath = path.join(
    tempDirectoryPath,
    'election-package.zip'
  );
  fs.writeFileSync(electionPackagePath, 'abcd');
  electionPackage = {
    artifactToExport: {
      type: 'election_package',
      filePath: electionPackagePath,
    },
    artifactToImport: {
      type: 'election_package',
      filePath: electionPackagePath,
    },
  };
});

afterEach(() => {
  fs.rmSync(tempDirectoryPath, { recursive: true });
});

const vxAdminTestConfig: ArtifactAuthenticationConfig = {
  signingMachineCertPath: getTestFilePath({
    fileType: 'vx-admin-cert-authority-cert.pem',
  }),
  signingMachinePrivateKey: {
    source: 'file',
    path: getTestFilePath({ fileType: 'vx-admin-private-key.pem' }),
  },
  vxCertAuthorityCertPath: getTestFilePath({
    fileType: 'vx-cert-authority-cert.pem',
  }),
};

const vxScanTestConfig: ArtifactAuthenticationConfig = {
  signingMachineCertPath: getTestFilePath({
    fileType: 'vx-scan-cert.pem',
  }),
  signingMachinePrivateKey: {
    source: 'file',
    path: getTestFilePath({ fileType: 'vx-scan-private-key.pem' }),
  },
  vxCertAuthorityCertPath: getTestFilePath({
    fileType: 'vx-cert-authority-cert.pem',
  }),
};

/**
 * Defining artifacts in test.each configs directly results in compile-time errors due to variables
 * being used before they're assigned to in the beforeEach block, so we use functions to defer
 * variable access.
 */
type ArtifactGenerator = () => {
  artifactToExport: ArtifactToExport;
  artifactToImport: ArtifactToImport;
};

test.each<{
  description: string;
  artifactGenerator: ArtifactGenerator;
  exportingMachineConfig: ArtifactAuthenticationConfig;
  importingMachineConfig: ArtifactAuthenticationConfig;
}>([
  {
    description: 'cast vote records',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
  },
  {
    description: 'election package',
    artifactGenerator: () => electionPackage,
    exportingMachineConfig: vxAdminTestConfig,
    importingMachineConfig: vxScanTestConfig,
  },
])(
  'Preparing signature file and authenticating artifact using signature file - $description',
  async ({
    artifactGenerator,
    exportingMachineConfig,
    importingMachineConfig,
  }) => {
    const { artifactToExport, artifactToImport } = artifactGenerator();
    const signatureFile = await prepareSignatureFile(
      artifactToExport,
      exportingMachineConfig
    );
    fs.writeFileSync(
      path.join(tempDirectoryPath, signatureFile.fileName),
      signatureFile.fileContents
    );
    expect(
      await authenticateArtifactUsingSignatureFile(
        artifactToImport,
        importingMachineConfig
      )
    ).toEqual(ok());
  }
);

test.each<{
  description: string;
  artifactGenerator: ArtifactGenerator;
  exportingMachineConfig: ArtifactAuthenticationConfig;
  importingMachineConfig: ArtifactAuthenticationConfig;
  editsAfterWritingSignatureFile: () => void;
  expectedErrorMessage: string;
}>([
  {
    description: 'cast vote records, altered metadata file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      const metadataFilePath = path.join(
        directoryPath,
        CastVoteRecordExportFileName.METADATA
      );
      const metadataFileContents = fs.readFileSync(metadataFilePath, 'utf-8');
      const metadataFileContentsAltered = JSON.stringify({
        ...JSON.parse(metadataFileContents),
        castVoteRecordRootHash: expectedCastVoteRecordRootHash.replace(
          'a',
          'b'
        ),
      });
      fs.writeFileSync(metadataFilePath, metadataFileContentsAltered);
    },
    expectedErrorMessage: 'Verification failure',
  },
  {
    description: 'cast vote records, removed metadata file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.rmSync(
        path.join(directoryPath, CastVoteRecordExportFileName.METADATA)
      );
    },
    expectedErrorMessage: 'ENOENT: no such file or directory',
  },
  {
    description: 'cast vote records, altered cast vote record file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.appendFileSync(
        path.join(
          directoryPath,
          cvrId1,
          CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
        ),
        '!'
      );
    },
    expectedErrorMessage:
      "Cast vote record root hash in metadata file doesn't match recomputed hash",
  },
  {
    description: 'cast vote records, removed cast vote record file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.rmSync(
        path.join(
          directoryPath,
          cvrId1,
          CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
        )
      );
    },
    expectedErrorMessage: 'ENOENT: no such file or directory',
  },
  {
    description: 'cast vote records, added cast vote record sub-directory',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.mkdirSync(path.join(directoryPath, cvrId3));
      fs.writeFileSync(
        path.join(
          directoryPath,
          cvrId3,
          CastVoteRecordExportFileName.CAST_VOTE_RECORD_REPORT
        ),
        'c'
      );
    },
    expectedErrorMessage:
      "Cast vote record root hash in metadata file doesn't match recomputed hash",
  },
  {
    description: 'cast vote records, removed cast vote record sub-directory',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.rmSync(path.join(directoryPath, cvrId2), { recursive: true });
    },
    expectedErrorMessage:
      "Cast vote record root hash in metadata file doesn't match recomputed hash",
  },
  {
    description:
      'cast vote records, renamed cast vote record sub-directory (renamed such that the alphabetical order is unchanged)',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      // cp and cpSync are experimental so not recommended for use in production but fine for use
      // in tests
      fs.cpSync(
        path.join(directoryPath, cvrId2),
        path.join(directoryPath, cvrId3),
        { recursive: true }
      );
      fs.rmSync(path.join(directoryPath, cvrId2), { recursive: true });
    },
    expectedErrorMessage:
      "Cast vote record root hash in metadata file doesn't match recomputed hash",
  },
  {
    description: 'cast vote records, unparsable export directory name',
    artifactGenerator: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { artifactToExport, artifactToImport } = castVoteRecords;
      const { directoryPath } = artifactToImport;
      const editedDirectoryPath = directoryPath.replaceAll('_', '-');
      return {
        artifactToExport,
        artifactToImport: {
          ...artifactToImport,
          directoryPath: editedDirectoryPath,
        },
      };
    },
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      const editedDirectoryPath = directoryPath.replaceAll('_', '-');
      fs.renameSync(directoryPath, editedDirectoryPath);
      fs.renameSync(
        `${directoryPath}${SIGNATURE_FILE_EXTENSION}`,
        `${editedDirectoryPath}${SIGNATURE_FILE_EXTENSION}`
      );
    },
    expectedErrorMessage: 'Error parsing export directory name',
  },
  {
    description:
      'cast vote records, mismatched machine ID in export directory name',
    artifactGenerator: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { artifactToExport, artifactToImport } = castVoteRecords;
      const { directoryPath } = artifactToImport;
      const editedDirectoryPath = directoryPath.replace(
        DEV_MACHINE_ID,
        `${DEV_MACHINE_ID}-edited`
      );
      fs.renameSync(directoryPath, editedDirectoryPath);
      return {
        artifactToExport: {
          ...artifactToExport,
          directoryName: path.basename(editedDirectoryPath),
        },
        artifactToImport: {
          ...artifactToImport,
          directoryPath: editedDirectoryPath,
        },
      };
    },
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {},
    expectedErrorMessage:
      "Machine ID in export directory name doesn't match machine ID in signing machine cert: " +
      `${DEV_MACHINE_ID}-edited != ${DEV_MACHINE_ID}`,
  },
  {
    description: 'cast vote records, mismatched machine ID in metadata file',
    artifactGenerator: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { artifactToExport, artifactToImport } = castVoteRecords;
      const { directoryPath } = artifactToImport;
      const metadataFilePath = path.join(
        directoryPath,
        CastVoteRecordExportFileName.METADATA
      );
      const metadataFileContents = fs.readFileSync(metadataFilePath, 'utf-8');
      const metadataFileContentsAltered = JSON.stringify({
        ...JSON.parse(metadataFileContents),
        batchManifest: [{ scannerId: `${DEV_MACHINE_ID}-edited` }],
      });
      fs.writeFileSync(metadataFilePath, metadataFileContentsAltered);

      return {
        artifactToExport: {
          ...artifactToExport,
          metadataFileContents: metadataFileContentsAltered,
        },
        artifactToImport,
      };
    },
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    editsAfterWritingSignatureFile: () => {},
    expectedErrorMessage:
      "Scanner ID in metadata file doesn't match machine ID in signing machine cert: " +
      `${DEV_MACHINE_ID}-edited != ${DEV_MACHINE_ID}`,
  },
  {
    description: 'election package',
    artifactGenerator: () => electionPackage,
    exportingMachineConfig: vxAdminTestConfig,
    importingMachineConfig: vxScanTestConfig,
    editsAfterWritingSignatureFile: () => {
      assert(electionPackage.artifactToImport.type === 'election_package');
      const { filePath } = electionPackage.artifactToImport;
      fs.appendFileSync(filePath, '!');
    },
    expectedErrorMessage: 'Verification failure',
  },
])(
  'Detecting that an artifact has been tampered with - $description',
  async ({
    artifactGenerator,
    exportingMachineConfig,
    importingMachineConfig,
    editsAfterWritingSignatureFile,
    expectedErrorMessage,
  }) => {
    const { artifactToExport, artifactToImport } = artifactGenerator();
    const signatureFile = await prepareSignatureFile(
      artifactToExport,
      exportingMachineConfig
    );
    fs.writeFileSync(
      path.join(tempDirectoryPath, signatureFile.fileName),
      signatureFile.fileContents
    );
    editsAfterWritingSignatureFile();
    const authenticationResult = await authenticateArtifactUsingSignatureFile(
      artifactToImport,
      importingMachineConfig
    );
    expect(authenticationResult.isErr()).toEqual(true);
    expect(authenticationResult.err()?.message).toContain(expectedErrorMessage);
  }
);

test('Error parsing cast vote record export metadata file', async () => {
  assert(castVoteRecords.artifactToExport.type === 'cast_vote_records');
  assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
  castVoteRecords.artifactToExport.metadataFileContents += '!';
  fs.appendFileSync(
    path.join(
      castVoteRecords.artifactToImport.directoryPath,
      CastVoteRecordExportFileName.METADATA
    ),
    '!' // Invalid JSON
  );

  const signatureFile = await prepareSignatureFile(
    castVoteRecords.artifactToExport,
    vxScanTestConfig
  );
  fs.writeFileSync(
    path.join(tempDirectoryPath, signatureFile.fileName),
    signatureFile.fileContents
  );
  const authenticationResult = await authenticateArtifactUsingSignatureFile(
    castVoteRecords.artifactToImport,
    vxAdminTestConfig
  );
  expect(authenticationResult.err()?.message).toContain(
    'Error parsing metadata file'
  );
});
