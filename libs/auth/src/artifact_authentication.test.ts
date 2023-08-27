import fs from 'fs';
import path from 'path';
import { dirSync } from 'tmp';
import { assert, err, ok } from '@votingworks/basics';
import { CastVoteRecordExportMetadata, CVR } from '@votingworks/types';

import { getTestFilePath } from '../test/utils';
import {
  ArtifactToExport,
  ArtifactToImport,
  authenticateArtifactUsingSignatureFile,
  prepareSignatureFile,
} from './artifact_authentication';
import { ArtifactAuthenticationConfig } from './config';

let tempDirectoryPath: string;
let mockElectionPackage: {
  artifactToExport: ArtifactToExport;
  artifactToImport: ArtifactToImport;
};
let mockCastVoteRecords: {
  artifactToExport: ArtifactToExport;
  artifactToImport: ArtifactToImport;
};

beforeEach(() => {
  tempDirectoryPath = dirSync().name;

  // Prepare mock election package
  const mockElectionPackagePath = path.join(
    tempDirectoryPath,
    'election-package.zip'
  );
  fs.writeFileSync(mockElectionPackagePath, 'abcd');
  mockElectionPackage = {
    artifactToExport: {
      type: 'election_package',
      filePath: mockElectionPackagePath,
    },
    artifactToImport: {
      type: 'election_package',
      filePath: mockElectionPackagePath,
    },
  };

  // Prepare mock cast vote records
  const mockCastVoteRecordsPath = path.join(
    tempDirectoryPath,
    'cast-vote-records'
  );
  fs.mkdirSync(mockCastVoteRecordsPath);
  fs.mkdirSync(path.join(mockCastVoteRecordsPath, '1'));
  fs.writeFileSync(path.join(mockCastVoteRecordsPath, '1', 'a'), 'abcd');
  fs.writeFileSync(path.join(mockCastVoteRecordsPath, '1', 'b'), 'efgh');
  fs.mkdirSync(path.join(mockCastVoteRecordsPath, '2'));
  fs.writeFileSync(path.join(mockCastVoteRecordsPath, '2', 'a'), 'ijkl');
  fs.writeFileSync(path.join(mockCastVoteRecordsPath, '2', 'b'), 'mnop');
  const mockCastVoteRecordExportMetadata: CastVoteRecordExportMetadata = {
    arePollsClosed: true,
    castVoteRecordReportMetadata: {} as unknown as CVR.CastVoteRecordReport,
    castVoteRecordRootHash: 'abcd1234',
  };
  fs.writeFileSync(
    path.join(mockCastVoteRecordsPath, 'metadata.json'),
    JSON.stringify(mockCastVoteRecordExportMetadata)
  );
  mockCastVoteRecords = {
    artifactToExport: {
      type: 'cast_vote_records',
      context: 'export',
      directoryName: path.basename(mockCastVoteRecordsPath),
      metadataFileContents: JSON.stringify(mockCastVoteRecordExportMetadata),
    },
    artifactToImport: {
      type: 'cast_vote_records',
      context: 'import',
      directoryPath: mockCastVoteRecordsPath,
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
    artifactGenerator: () => mockCastVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
  },
  {
    description: 'election package',
    artifactGenerator: () => mockElectionPackage,
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
    description: 'election package',
    artifactGenerator: () => mockElectionPackage,
    exportingMachineConfig: vxAdminTestConfig,
    importingMachineConfig: vxScanTestConfig,
    tamperFn: () => {
      assert(mockElectionPackage.artifactToImport.type === 'election_package');
      fs.appendFileSync(mockElectionPackage.artifactToImport.filePath, 'e');
    },
  },
  {
    description: 'cast vote records',
    artifactGenerator: () => mockCastVoteRecords,
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => {
      assert(mockCastVoteRecords.artifactToImport.type === 'cast_vote_records');
      const metadataFilePath = path.join(
        mockCastVoteRecords.artifactToImport.directoryPath,
        'metadata.json'
      );
      const metadataFileContents = fs
        .readFileSync(metadataFilePath)
        .toString('utf-8');
      const metadataFileContentsAltered = JSON.stringify({
        ...JSON.parse(metadataFileContents),
        castVoteRecordRootHash: 'efgh5678',
      });
      fs.writeFileSync(metadataFilePath, metadataFileContentsAltered);
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
