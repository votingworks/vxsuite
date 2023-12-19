import fs from 'fs';
import path from 'path';
import { dirSync } from 'tmp';
import { z } from 'zod';
import { assert, err, ok } from '@votingworks/basics';
import {
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CVR,
} from '@votingworks/types';

import { getTestFilePath } from '../test/utils';
import {
  ArtifactToExport,
  ArtifactToImport,
  authenticateArtifactUsingSignatureFile,
  prepareSignatureFile,
} from './artifact_authentication';
import { ArtifactAuthenticationConfig } from './config';

jest.mock('@votingworks/types', (): typeof import('@votingworks/types') => ({
  ...jest.requireActual('@votingworks/types'),
  // Avoid having to prepare a complete CastVoteRecordExportMetadata object
  CastVoteRecordExportMetadataSchema: z.any(),
}));

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
    'cast-vote-record-export'
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
    castVoteRecordReportMetadata: {} as unknown as CVR.CastVoteRecordReport,
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
  tamperFn: () => void;
}>([
  {
    description: 'cast vote records, altered metadata file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
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
  },
  {
    description: 'cast vote records, removed metadata file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.rmSync(
        path.join(directoryPath, CastVoteRecordExportFileName.METADATA)
      );
    },
  },
  {
    description: 'cast vote records, altered cast vote record file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
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
  },
  {
    description: 'cast vote records, removed cast vote record file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
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
  },
  {
    description: 'cast vote records, added cast vote record directory',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
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
  },
  {
    description: 'cast vote records, removed cast vote record directory',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.rmSync(path.join(directoryPath, cvrId2), { recursive: true });
    },
  },
  {
    description:
      'cast vote records, renamed cast vote record directory (renamed such that the alphabetical order is unchanged)',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
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
  },
  {
    description: 'election package',
    artifactGenerator: () => electionPackage,
    exportingMachineConfig: vxAdminTestConfig,
    importingMachineConfig: vxScanTestConfig,
    tamperFn: () => {
      assert(electionPackage.artifactToImport.type === 'election_package');
      const { filePath } = electionPackage.artifactToImport;
      fs.appendFileSync(filePath, '!');
    },
  },
])(
  'Detecting that an artifact has been tampered with - $description',
  async ({
    artifactGenerator,
    exportingMachineConfig,
    importingMachineConfig,
    tamperFn,
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
    tamperFn();
    expect(
      await authenticateArtifactUsingSignatureFile(
        artifactToImport,
        importingMachineConfig
      )
    ).toEqual(err(expect.any(Error)));
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
