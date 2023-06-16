import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { dirSync } from 'tmp';
import { err, ok } from '@votingworks/basics';

import { getTestFilePath } from '../test/utils';
import { Artifact, ArtifactAuthenticator } from './artifact_authenticator';
import { ArtifactAuthenticatorConfig } from './config';

let tempDirectoryPath: string;
let tempFile1Path: string;
let tempFile2Path: string;
let tempSubDirectoryPath: string;
let tempFile3Path: string;

beforeEach(() => {
  tempDirectoryPath = dirSync().name;
  tempFile1Path = path.join(tempDirectoryPath, 'file-1.txt');
  tempFile2Path = path.join(tempDirectoryPath, 'file-2.txt');
  tempSubDirectoryPath = path.join(tempDirectoryPath, 'sub-dir');
  tempFile3Path = path.join(tempSubDirectoryPath, 'file-3.txt');
  fs.writeFileSync(tempFile1Path, 'abcd');
  fs.writeFileSync(tempFile2Path, 'efgh');
  fs.mkdirSync(tempSubDirectoryPath);
  fs.writeFileSync(tempFile3Path, 'ijkl');
});

afterEach(() => {
  jest.restoreAllMocks(); // Clear spies
  fs.rmSync(tempDirectoryPath, { recursive: true });
});

const vxAdminTestConfig: ArtifactAuthenticatorConfig = {
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

const vxScanTestConfig: ArtifactAuthenticatorConfig = {
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
type ArtifactGenerator = () => Artifact;

test.each<{
  description: string;
  artifactGenerator: ArtifactGenerator;
  exportingMachineConfig: ArtifactAuthenticatorConfig;
  importingMachineConfig: ArtifactAuthenticatorConfig;
}>([
  {
    description: 'ballot package',
    artifactGenerator: () => ({
      type: 'ballot_package',
      path: tempFile1Path,
    }),
    exportingMachineConfig: vxAdminTestConfig,
    importingMachineConfig: vxScanTestConfig,
  },
  {
    description: 'cast vote records',
    artifactGenerator: () => ({
      type: 'cast_vote_records',
      path: tempDirectoryPath,
    }),
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
  },
])(
  'Writing signature file and authenticating artifact using signature file - $description',
  async ({
    artifactGenerator,
    exportingMachineConfig,
    importingMachineConfig,
  }) => {
    const artifact = artifactGenerator();
    await new ArtifactAuthenticator(exportingMachineConfig).writeSignatureFile(
      artifact
    );
    expect(
      await new ArtifactAuthenticator(
        importingMachineConfig
      ).authenticateArtifactUsingSignatureFile(artifact)
    ).toEqual(ok());
  }
);

test.each<{
  description: string;
  artifactGenerator: ArtifactGenerator;
  exportingMachineConfig: ArtifactAuthenticatorConfig;
  importingMachineConfig: ArtifactAuthenticatorConfig;
  tamperFn: () => void;
}>([
  {
    description: 'ballot package',
    artifactGenerator: () => ({
      type: 'ballot_package',
      path: tempFile1Path,
    }),
    exportingMachineConfig: vxAdminTestConfig,
    importingMachineConfig: vxScanTestConfig,
    tamperFn: () => fs.appendFileSync(tempFile1Path, 'e'),
  },
  {
    description: 'cast vote records, file is modified',
    artifactGenerator: () => ({
      type: 'cast_vote_records',
      path: tempDirectoryPath,
    }),
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => fs.appendFileSync(tempFile1Path, 'e'),
  },
  {
    description: 'cast vote records, file is deleted',
    artifactGenerator: () => ({
      type: 'cast_vote_records',
      path: tempDirectoryPath,
    }),
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
    tamperFn: () => fs.rmSync(tempFile2Path),
  },
])(
  'Detecting that an artifact has been tampered with - $description',
  async ({
    artifactGenerator,
    exportingMachineConfig,
    importingMachineConfig,
    tamperFn,
  }) => {
    const artifact = artifactGenerator();
    await new ArtifactAuthenticator(exportingMachineConfig).writeSignatureFile(
      artifact
    );
    tamperFn();
    expect(
      await new ArtifactAuthenticator(
        importingMachineConfig
      ).authenticateArtifactUsingSignatureFile(artifact)
    ).toEqual(
      err(
        new Error(`Error authenticating ${artifact.path} using signature file`)
      )
    );
  }
);

test('Writing signature file to a USB drive', async () => {
  // Mock writeFile since we don't want this test to actually write to /media
  jest
    .spyOn(fsPromises, 'writeFile')
    .mockImplementationOnce(() => Promise.resolve());
  const customDataFlusher = jest.fn();

  await new ArtifactAuthenticator({
    ...vxScanTestConfig,
    customDataFlusher,
  }).writeSignatureFile(
    { type: 'cast_vote_records', path: tempDirectoryPath },
    '/media/usb-drive'
  );
  expect(customDataFlusher).toHaveBeenCalledTimes(1);
  expect(customDataFlusher).toHaveBeenNthCalledWith(
    1,
    `/media/usb-drive/${path.basename(tempDirectoryPath)}.vxsig`
  );
});
