import fs from 'fs';
import { FileResult, fileSync } from 'tmp';
import { err, ok } from '@votingworks/basics';

import { getTestFilePath } from '../test/utils';
import { Artifact, ArtifactAuthenticator } from './artifact_authenticator';
import { ArtifactAuthenticatorConfig } from './config';

let tempFile: FileResult;

beforeEach(() => {
  tempFile = fileSync();
});

afterEach(() => {
  tempFile.removeCallback();
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

test.each<{
  artifactType: Artifact['type'];
  exportingMachineConfig: ArtifactAuthenticatorConfig;
  importingMachineConfig: ArtifactAuthenticatorConfig;
}>([
  {
    artifactType: 'ballot_package',
    exportingMachineConfig: vxAdminTestConfig,
    importingMachineConfig: vxScanTestConfig,
  },
  {
    artifactType: 'cvr_file',
    exportingMachineConfig: vxScanTestConfig,
    importingMachineConfig: vxAdminTestConfig,
  },
])(
  'Writing signature file and authenticating artifact using signature file - $artifactType',
  async ({ artifactType, exportingMachineConfig, importingMachineConfig }) => {
    fs.writeFileSync(tempFile.name, 'abcd');
    const artifact: Artifact = { type: artifactType, path: tempFile.name };

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

test('Detecting that an artifact has been tampered with', async () => {
  fs.writeFileSync(tempFile.name, 'abcd');
  const artifact: Artifact = { type: 'cvr_file', path: tempFile.name };

  await new ArtifactAuthenticator(vxScanTestConfig).writeSignatureFile(
    artifact
  );
  fs.writeFileSync(tempFile.name, 'abcde');
  expect(
    await new ArtifactAuthenticator(
      vxAdminTestConfig
    ).authenticateArtifactUsingSignatureFile(artifact)
  ).toEqual(
    err(new Error(`Error authenticating ${tempFile.name} using signature file`))
  );
});

test('Mismatched artifact type', async () => {
  fs.writeFileSync(tempFile.name, 'abcd');
  const artifact: Artifact = { type: 'cvr_file', path: tempFile.name };

  await new ArtifactAuthenticator(vxScanTestConfig).writeSignatureFile(
    artifact
  );
  expect(
    await new ArtifactAuthenticator(
      vxAdminTestConfig
    ).authenticateArtifactUsingSignatureFile({
      ...artifact,
      type: 'ballot_package',
    })
  ).toEqual(
    err(new Error(`Error authenticating ${tempFile.name} using signature file`))
  );
});
