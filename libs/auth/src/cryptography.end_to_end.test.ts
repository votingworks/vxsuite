import { Readable } from 'node:stream';
import { TEST_JURISDICTION } from '@votingworks/types';

import { getTestFilePath } from '../test/utils';
import {
  CERT_EXPIRY_IN_DAYS,
  constructMachineCertSubject,
  parseCert,
} from './certs';
import {
  createCert,
  extractPublicKeyFromCert,
  signMessage,
  verifyFirstCertWasSignedBySecondCert,
  verifySignature,
} from './cryptography';

/**
 * Whereas cryptography.test.ts focuses on code coverage, cryptography.end_to_end.test.ts uses no
 * mocks and verifies:
 * - The complex control flows of createCert and signMessage
 * - The correctness of OpenSSL commands
 */

test('createCert end-to-end', async () => {
  const vxCertAuthorityCertPath = getTestFilePath({
    fileType: 'vx-cert-authority-cert.pem',
  });
  const vxPrivateKeyPath = getTestFilePath({
    fileType: 'vx-private-key.pem',
  });
  const vxAdminPrivateKeyPath = getTestFilePath({
    fileType: 'vx-admin-private-key.pem',
  });

  const vxAdminCertAuthorityCert = await createCert({
    certKeyInput: {
      type: 'private',
      key: { source: 'file', path: vxAdminPrivateKeyPath },
    },
    certSubject: constructMachineCertSubject('admin', TEST_JURISDICTION),
    certType: 'cert_authority_cert',
    expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
    signingCertAuthorityCertPath: vxCertAuthorityCertPath,
    signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
  });
  await verifyFirstCertWasSignedBySecondCert(
    vxAdminCertAuthorityCert,
    vxCertAuthorityCertPath
  );
  const certDetails = await parseCert(vxAdminCertAuthorityCert);
  expect(certDetails).toEqual({
    component: 'admin',
    jurisdiction: TEST_JURISDICTION,
  });
});

test('signMessage end-to-end', async () => {
  const vxScanCertPath = getTestFilePath({ fileType: 'vx-scan-cert.pem' });
  const vxScanPrivateKeyPath = getTestFilePath({
    fileType: 'vx-scan-private-key.pem',
  });

  const messageSignature = await signMessage({
    message: Readable.from('abcd'),
    signingPrivateKey: { source: 'file', path: vxScanPrivateKeyPath },
  });
  const vxScanPublicKey = await extractPublicKeyFromCert(vxScanCertPath);
  await verifySignature({
    message: Readable.from('abcd'),
    messageSignature,
    publicKey: vxScanPublicKey,
  });
});
