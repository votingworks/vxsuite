import { expect, test } from 'vitest';
import { Readable } from 'node:stream';
import { DEV_MACHINE_ID, TEST_JURISDICTION } from '@votingworks/types';

import { getTestFilePath } from '../test/utils';
import {
  CERT_EXPIRY_IN_DAYS,
  constructCardCertSubject,
  constructMachineCertSubject,
  parseCert,
} from './certs';
import {
  createCert,
  extractPublicKeyFromCert,
  publicKeyDerToPem,
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

test('createCert end-to-end - machine cert', async () => {
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
    certSubject: constructMachineCertSubject({
      machineType: 'admin',
      machineId: DEV_MACHINE_ID,
      jurisdiction: TEST_JURISDICTION,
    }),
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
    machineId: DEV_MACHINE_ID,
    jurisdiction: TEST_JURISDICTION,
  });
});

test('createCert end-to-end - card cert', async () => {
  const vxAdminCertAuthorityCertPath = getTestFilePath({
    fileType: 'vx-admin-cert-authority-cert.pem',
  });
  const vxAdminPrivateKeyPath = getTestFilePath({
    fileType: 'vx-admin-private-key.pem',
  });
  const cardIdentityPublicKeyPath = getTestFilePath({
    fileType: 'card-identity-public-key.der',
    cardType: 'system-administrator',
  });

  const cardIdentityCert = await createCert({
    certKeyInput: {
      type: 'public',
      key: {
        source: 'inline',
        content: (await publicKeyDerToPem(cardIdentityPublicKeyPath)).toString(
          'utf-8'
        ),
      },
    },
    certSubject: constructCardCertSubject({
      user: {
        role: 'system_administrator',
        jurisdiction: TEST_JURISDICTION,
      },
    }),
    certType: 'standard_cert',
    expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
    signingCertAuthorityCertPath: vxAdminCertAuthorityCertPath,
    signingPrivateKey: { source: 'file', path: vxAdminPrivateKeyPath },
  });
  await verifyFirstCertWasSignedBySecondCert(
    cardIdentityCert,
    vxAdminCertAuthorityCertPath
  );
  const certDetails = await parseCert(cardIdentityCert);
  expect(certDetails).toEqual({
    component: 'card',
    cardType: 'system-administrator',
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
