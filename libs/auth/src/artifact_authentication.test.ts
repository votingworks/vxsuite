import fs from 'fs';
import path from 'path';
import { dirSync } from 'tmp';
import { assert, err, ok } from '@votingworks/basics';
import { mockOf } from '@votingworks/test-utils';
import {
  CastVoteRecordExportFileName,
  CastVoteRecordExportMetadata,
  CVR,
  safeParseJson,
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
  safeParseJson: jest.fn(),
}));

/**
 * The root hash for the mock cast vote records created in the beforeEach block
 */
const expectedCastVoteRecordRootHash =
  '2b0e230f18ffbb4f40c00930b456fcc3a3b3c279c099a67d404a1bb03020cb3b';

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
  // Avoid having to prepare a complete CVR.CastVoteRecordReport object for
  // CastVoteRecordExportMetadata
  mockOf(safeParseJson).mockImplementation((value) => ok(JSON.parse(value)));

  tempDirectoryPath = dirSync().name;

  // Prepare mock cast vote records
  const castVoteRecordExportDirectoryPath = path.join(
    tempDirectoryPath,
    'cast-vote-record-export'
  );
  fs.mkdirSync(castVoteRecordExportDirectoryPath);
  fs.mkdirSync(path.join(castVoteRecordExportDirectoryPath, cvrId1));
  fs.mkdirSync(path.join(castVoteRecordExportDirectoryPath, cvrId2));
  for (const { directoryName, fileName, fileContents } of [
    { directoryName: cvrId1, fileName: '1', fileContents: '1a' },
    { directoryName: cvrId1, fileName: '2', fileContents: '2a' },
    { directoryName: cvrId2, fileName: '1', fileContents: '1b' },
    { directoryName: cvrId2, fileName: '2', fileContents: '2b' },
  ]) {
    fs.writeFileSync(
      path.join(castVoteRecordExportDirectoryPath, directoryName, fileName),
      fileContents
    );
  }
  const castVoteRecordExportMetadata: CastVoteRecordExportMetadata = {
    arePollsClosed: true,
    castVoteRecordReportMetadata: {} as unknown as CVR.CastVoteRecordReport,
    castVoteRecordRootHash: expectedCastVoteRecordRootHash,
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
      fs.appendFileSync(path.join(directoryPath, cvrId1, '1'), '!');
    },
  },
  {
    description: 'cast vote records, added cast vote record file',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.writeFileSync(path.join(directoryPath, cvrId1, '3'), '');
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
      fs.rmSync(path.join(directoryPath, cvrId1, '1'));
    },
  },
  {
    description:
      'cast vote records, renamed cast vote record file (renamed such that the alphabetical order is unchanged)',
    artifactGenerator: () => castVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
      assert(castVoteRecords.artifactToImport.type === 'cast_vote_records');
      const { directoryPath } = castVoteRecords.artifactToImport;
      fs.renameSync(
        path.join(directoryPath, cvrId1, '1'),
        path.join(directoryPath, cvrId1, '1-renamed')
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
  mockOf(safeParseJson).mockImplementation(() => err(new Error('Whoa!')));

  const signatureFile = await prepareSignatureFile(
    castVoteRecords.artifactToExport,
    vxScanTestConfig
  );
  fs.writeFileSync(
    path.join(tempDirectoryPath, signatureFile.fileName),
    signatureFile.fileContents
  );
  expect(
    await authenticateArtifactUsingSignatureFile(
      castVoteRecords.artifactToImport,
      vxAdminTestConfig
    )
  ).toEqual(err(expect.any(Error)));
});
