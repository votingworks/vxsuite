import { expect, test } from 'vitest';
import { Readable } from 'node:stream';
import { DEV_MACHINE_ID, TEST_JURISDICTION } from '@votingworks/types';

import { getTestFile } from '../test/utils';
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
  const vxCertAuthorityCert = getTestFile({
    fileType: 'vx-cert-authority-cert.pem',
  });
  const vxPrivateKey = getTestFile({
    fileType: 'vx-private-key.pem',
  });
  const vxAdminPrivateKey = getTestFile({
    fileType: 'vx-admin-private-key.pem',
  });

  const vxAdminCertAuthorityCert = await createCert({
    certKeyInput: vxAdminPrivateKey,
    certSubject: constructMachineCertSubject({
      machineType: 'admin',
      machineId: DEV_MACHINE_ID,
      jurisdiction: TEST_JURISDICTION,
    }),
    certType: 'cert_authority_cert',
    expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
    signingCertAuthorityCert: vxCertAuthorityCert,
    signingPrivateKey: vxPrivateKey,
  });
  await verifyFirstCertWasSignedBySecondCert(
    vxAdminCertAuthorityCert,
    vxCertAuthorityCert
  );
  const certDetails = await parseCert(vxAdminCertAuthorityCert);
  expect(certDetails).toEqual({
    component: 'admin',
    machineId: DEV_MACHINE_ID,
    jurisdiction: TEST_JURISDICTION,
  });
});

test('createCert end-to-end - card cert', async () => {
  const vxAdminCertAuthorityCert = getTestFile({
    fileType: 'vx-admin-cert-authority-cert.pem',
  });
  const vxAdminPrivateKey = getTestFile({
    fileType: 'vx-admin-private-key.pem',
  });
  const cardIdentityPublicKey = getTestFile({
    fileType: 'card-identity-public-key.der',
    cardType: 'system-administrator',
  });

  const cardIdentityCert = await createCert({
    certKeyInput: await publicKeyDerToPem(cardIdentityPublicKey),
    certSubject: constructCardCertSubject({
      user: {
        role: 'system_administrator',
        jurisdiction: TEST_JURISDICTION,
        programmingMachineType: 'admin',
      },
    }),
    certType: 'standard_cert',
    expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
    signingCertAuthorityCert: vxAdminCertAuthorityCert,
    signingPrivateKey: vxAdminPrivateKey,
  });
  await verifyFirstCertWasSignedBySecondCert(
    cardIdentityCert,
    vxAdminCertAuthorityCert
  );
  const certDetails = await parseCert(cardIdentityCert);
  expect(certDetails).toEqual({
    component: 'card',
    cardType: 'system-administrator',
    jurisdiction: TEST_JURISDICTION,
  });
});

test('signMessage end-to-end', async () => {
  const vxScanCert = getTestFile({ fileType: 'vx-scan-cert.pem' });
  const vxScanPrivateKey = getTestFile({
    fileType: 'vx-scan-private-key.pem',
  });

  const messageSignature = await signMessage({
    message: Readable.from('abcd'),
    signingPrivateKey: vxScanPrivateKey,
  });
  const vxScanPublicKey = await extractPublicKeyFromCert(vxScanCert);
  await verifySignature({
    message: Readable.from('abcd'),
    messageSignature,
    publicKey: vxScanPublicKey,
  });
});
