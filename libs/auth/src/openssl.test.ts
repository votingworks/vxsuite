import { Buffer } from 'buffer';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { fileSync } from 'tmp';
import {
  fakeChildProcess as newMockChildProcess,
  FakeChildProcess as MockChildProcess,
  mockOf,
} from '@votingworks/test-utils';

import {
  createCert,
  createCertGivenCertSigningRequest,
  createCertHelper,
  CreateCertInput,
  createCertSigningRequest,
  openssl,
  parseCreateCertInput,
} from './openssl';
import { OPENSSL_TPM_ENGINE_NAME, TPM_KEY_ID, TPM_KEY_PASSWORD } from './tpm';

jest.mock('child_process');
jest.mock('tmp');

let mockChildProcess: MockChildProcess;
let nextTempFileName = 0;
const tempFileRemoveCallbacks: jest.Mock[] = [];

beforeEach(() => {
  mockChildProcess = newMockChildProcess();
  mockOf(spawn).mockImplementation(() => mockChildProcess);

  nextTempFileName = 0;
  mockOf(fileSync).mockImplementation(() => {
    nextTempFileName += 1;
    const removeCallback = jest.fn();
    tempFileRemoveCallbacks.push(removeCallback);
    return {
      fd: nextTempFileName,
      name: `/tmp/openssl/${nextTempFileName}`,
      removeCallback,
    };
  });
  jest.spyOn(fs, 'writeFile').mockResolvedValue();
});

afterEach(() => {
  // Remove all mock implementations
  jest.resetAllMocks();
});

const fileBuffers = [
  Buffer.from('file1Contents', 'utf-8'),
  Buffer.from('file2contents', 'utf-8'),
] as const;
const tempFilePaths = [
  '/tmp/openssl/1',
  '/tmp/openssl/2',
  '/tmp/openssl/3',
] as const;
const responseChunks = [
  Buffer.from('Hey!', 'utf-8'),
  Buffer.from(' ', 'utf-8'),
  Buffer.from('How is it going?', 'utf-8'),
] as const;
const errorChunks = [
  Buffer.from('Uh ', 'utf-8'),
  Buffer.from('oh!', 'utf-8'),
] as const;

test('openssl', async () => {
  setTimeout(() => {
    responseChunks.forEach((responseChunk) => {
      mockChildProcess.stdout.emit('data', responseChunk);
    });
    mockChildProcess.stderr.emit('data', Buffer.from('Some warning', 'utf-8'));
    mockChildProcess.emit('close', 0);
  });

  const response = await openssl([
    'some',
    fileBuffers[0],
    'command',
    fileBuffers[1],
  ]);
  expect(response.toString('utf-8')).toEqual('Hey! How is it going?');

  expect(fileSync).toHaveBeenCalledTimes(2);
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
    'some',
    tempFilePaths[0],
    'command',
    tempFilePaths[1],
  ]);
  for (const tempFileRemoveCallback of tempFileRemoveCallbacks) {
    expect(tempFileRemoveCallback).toHaveBeenCalledTimes(1);
  }
});

test('openssl - no Buffer params', async () => {
  setTimeout(() => {
    for (const responseChunk of responseChunks) {
      mockChildProcess.stdout.emit('data', responseChunk);
    }
    mockChildProcess.emit('close', 0);
  });

  const response = await openssl(['some', 'command']);
  expect(response.toString('utf-8')).toEqual('Hey! How is it going?');

  expect(fileSync).toHaveBeenCalledTimes(0);
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', ['some', 'command']);
});

test('openssl - no standard output', async () => {
  setTimeout(() => {
    mockChildProcess.emit('close', 0);
  });

  const response = await openssl(['some', 'command']);
  expect(response).toEqual(Buffer.from([]));
});

test('openssl - error creating temporary file', async () => {
  mockOf(fileSync).mockImplementationOnce(() => {
    throw new Error('Whoa!');
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Whoa!');
});

test('openssl - error writing temp file', async () => {
  mockOf(fs.writeFile).mockImplementationOnce(() =>
    Promise.reject(new Error('Whoa!'))
  );

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Whoa!');
});

test('openssl - error cleaning up temp files', async () => {
  setTimeout(() => {
    for (const tempFileRemoveCallback of tempFileRemoveCallbacks) {
      tempFileRemoveCallback.mockRejectedValueOnce(new Error('Whoa!'));
    }
    mockChildProcess.emit('close', 0);
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Whoa!');
});

test('openssl - process exits with a non-success status code', async () => {
  setTimeout(() => {
    for (const errorChunk of errorChunks) {
      mockChildProcess.stderr.emit('data', errorChunk);
    }
    mockChildProcess.emit('close', 1);
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Uh oh!');
});

test('openssl - provides both stderr and stdout on error', async () => {
  setTimeout(() => {
    for (const errorChunk of errorChunks) {
      mockChildProcess.stderr.emit('data', errorChunk);
    }
    for (const responseChunk of responseChunks) {
      mockChildProcess.stdout.emit('data', responseChunk);
    }
    mockChildProcess.emit('close', 1);
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow(
    'Uh oh!\nHey! How is it going?'
  );
});

test.each<CreateCertInput>([
  {
    certKeyInput: {
      type: 'private',
      key: { source: 'file', path: '/path/to/private-key-1.pem' },
    },
    certSubject: '//',
    certType: 'cert_authority_cert',
    expiryInDays: 365,
    signingCertAuthorityCertPath: '/path/to/cert-authority-cert.pem',
    signingPrivateKey: { source: 'file', path: '/path/to/private-key-2.pem' },
  },
  {
    certKeyInput: {
      type: 'public',
      key: { source: 'inline', content: 'content' },
    },
    certSubject: '//',
    expiryInDays: 365,
    signingCertAuthorityCertPath: '/path/to/cert-authority-cert.pem',
    signingPrivateKey: { source: 'tpm' },
  },
])('parseCreateCertInput success', (createCertInput) => {
  expect(parseCreateCertInput(JSON.stringify(createCertInput))).toEqual(
    createCertInput
  );
});

test.each<string>([
  '',
  JSON.stringify({}),
  JSON.stringify({
    certKeyInput: {
      type: 'public',
      key: { source: 'inline', oops: 'oops' },
    },
    certSubject: '//',
    expiryInDays: 365,
    signingCertAuthorityCertPath: '/path/to/cert-authority-cert.pem',
    signingPrivateKey: { source: 'tpm' },
  }),
])('parseCreateCertInput error', (createCertInput) => {
  expect(() => parseCreateCertInput(createCertInput)).toThrow();
});

test('createCertSigningRequest', async () => {
  setTimeout(() => {
    mockChildProcess.emit('close', 0);
  });

  await createCertSigningRequest({
    certKey: { source: 'tpm' },
    certSubject: '//',
  });

  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
    'req',
    '-new',
    '-config',
    expect.stringContaining('/certs/openssl.cnf'),
    '-key',
    TPM_KEY_ID,
    '-keyform',
    'engine',
    '-engine',
    OPENSSL_TPM_ENGINE_NAME,
    '-passin',
    `pass:${TPM_KEY_PASSWORD}`,
    '-subj',
    '//',
  ]);
});

test('createCertGivenCertSigningRequest', async () => {
  setTimeout(() => {
    mockChildProcess.emit('close', 0);
  });

  await createCertGivenCertSigningRequest({
    certSigningRequest: Buffer.from('csr'),
    expiryInDays: 365,
    signingCertAuthorityCertPath: '/path/to/cert-authority-cert.pem',
    signingPrivateKey: { source: 'file', path: '/path/to/private-key.pem' },
  });

  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
    'x509',
    '-req',
    '-CA',
    '/path/to/cert-authority-cert.pem',
    '-CAkey',
    '/path/to/private-key.pem',
    '-CAcreateserial',
    '-CAserial',
    '/tmp/serial.txt',
    '-in',
    tempFilePaths[0],
    '-days',
    '365',
  ]);
});

test.each<{
  description: string;
  certKeyInput: CreateCertInput['certKeyInput'];
  certType?: CreateCertInput['certType'];
  signingPrivateKey: CreateCertInput['signingPrivateKey'];
  isThrowawayPrivateKeyCreationExpected: boolean;
  expectedOpensslCsrCreationRequestParams: string[];
  expectedOpensslCertCreationRequestParams: string[];
}>([
  {
    description:
      'certifying public key with private key file, ' +
      'where private key of public key to certify is unavailable',
    certKeyInput: {
      type: 'public',
      key: { source: 'inline', content: 'content' },
    },
    signingPrivateKey: { source: 'file', path: '/path/to/private-key.pem' },
    isThrowawayPrivateKeyCreationExpected: true,
    expectedOpensslCsrCreationRequestParams: [
      'req',
      '-new',
      '-config',
      expect.stringContaining('/certs/openssl.cnf'),
      '-key',
      tempFilePaths[0],
      '-subj',
      '//',
    ],
    expectedOpensslCertCreationRequestParams: [
      'x509',
      '-req',
      '-CA',
      '/path/to/cert-authority-cert.pem',
      '-CAkey',
      '/path/to/private-key.pem',
      '-CAcreateserial',
      '-CAserial',
      '/tmp/serial.txt',
      '-in',
      tempFilePaths[1],
      '-days',
      '365',
      '-force_pubkey',
      tempFilePaths[2],
    ],
  },
  {
    description:
      'certifying public key with TPM private key, ' +
      'where private key of public key to certify is unavailable',
    certKeyInput: {
      type: 'public',
      key: { source: 'inline', content: 'content' },
    },
    signingPrivateKey: { source: 'tpm' },
    isThrowawayPrivateKeyCreationExpected: true,
    expectedOpensslCsrCreationRequestParams: [
      'req',
      '-new',
      '-config',
      expect.stringContaining('/certs/openssl.cnf'),
      '-key',
      tempFilePaths[0],
      '-subj',
      '//',
    ],
    expectedOpensslCertCreationRequestParams: [
      'x509',
      '-req',
      '-CA',
      '/path/to/cert-authority-cert.pem',
      '-CAkey',
      TPM_KEY_ID,
      '-CAkeyform',
      'engine',
      '-engine',
      OPENSSL_TPM_ENGINE_NAME,
      '-passin',
      `pass:${TPM_KEY_PASSWORD}`,
      '-CAcreateserial',
      '-CAserial',
      '/tmp/serial.txt',
      '-in',
      tempFilePaths[1],
      '-days',
      '365',
      '-force_pubkey',
      tempFilePaths[2],
    ],
  },
  {
    description:
      'certifying public key with private key file, ' +
      'where private key of public key to certify is available and cert type is cert authority cert',
    certKeyInput: {
      type: 'private',
      key: { source: 'file', path: '/path/to/private-key-1.pem' },
    },
    certType: 'cert_authority_cert',
    signingPrivateKey: { source: 'file', path: '/path/to/private-key-2.pem' },
    isThrowawayPrivateKeyCreationExpected: false,
    expectedOpensslCsrCreationRequestParams: [
      'req',
      '-new',
      '-config',
      expect.stringContaining('/certs/openssl.cnf'),
      '-key',
      '/path/to/private-key-1.pem',
      '-subj',
      '//',
    ],
    expectedOpensslCertCreationRequestParams: [
      'x509',
      '-req',
      '-CA',
      '/path/to/cert-authority-cert.pem',
      '-CAkey',
      '/path/to/private-key-2.pem',
      '-CAcreateserial',
      '-CAserial',
      '/tmp/serial.txt',
      '-in',
      tempFilePaths[0],
      '-days',
      '365',
      '-extensions',
      'v3_ca',
      '-extfile',
      expect.stringContaining('/certs/openssl.cnf'),
    ],
  },
])(
  'createCertHelper - $description',
  async ({
    certKeyInput,
    certType,
    signingPrivateKey,
    isThrowawayPrivateKeyCreationExpected,
    expectedOpensslCsrCreationRequestParams,
    expectedOpensslCertCreationRequestParams,
  }) => {
    const expectedNumSpawnCalls = isThrowawayPrivateKeyCreationExpected ? 3 : 2;
    for (let i = 0; i < expectedNumSpawnCalls; i += 1) {
      setTimeout(() => {
        mockChildProcess.emit('close', 0);
      });
    }

    await createCertHelper({
      certKeyInput,
      certSubject: '//',
      certType,
      expiryInDays: 365,
      signingCertAuthorityCertPath: '/path/to/cert-authority-cert.pem',
      signingPrivateKey,
    });

    expect(spawn).toHaveBeenCalledTimes(expectedNumSpawnCalls);
    if (isThrowawayPrivateKeyCreationExpected) {
      expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
        'ecparam',
        '-genkey',
        '-name',
        'prime256v1',
        '-noout',
      ]);
    }
    expect(spawn).toHaveBeenNthCalledWith(
      isThrowawayPrivateKeyCreationExpected ? 2 : 1,
      'openssl',
      expectedOpensslCsrCreationRequestParams
    );
    expect(spawn).toHaveBeenNthCalledWith(
      isThrowawayPrivateKeyCreationExpected ? 3 : 2,
      'openssl',
      expectedOpensslCertCreationRequestParams
    );
  }
);

test.each<{
  certKeyInput: CreateCertInput['certKeyInput'];
  signingPrivateKey: CreateCertInput['signingPrivateKey'];
  isSudoExpected: boolean;
}>([
  {
    certKeyInput: {
      type: 'public',
      key: { source: 'inline', content: 'content' },
    },
    signingPrivateKey: { source: 'file', path: '/path/to/private-key.pem' },
    isSudoExpected: false,
  },
  {
    certKeyInput: {
      type: 'public',
      key: { source: 'inline', content: 'content' },
    },
    signingPrivateKey: { source: 'tpm' },
    isSudoExpected: true,
  },
])(
  'createCert',
  async ({ certKeyInput, signingPrivateKey, isSudoExpected }) => {
    setTimeout(() => {
      responseChunks.forEach((responseChunk) => {
        mockChildProcess.stdout.emit('data', responseChunk);
      });
      mockChildProcess.emit('close', 0);
    });

    const cert = await createCert({
      certKeyInput,
      certSubject: '//',
      expiryInDays: 365,
      signingCertAuthorityCertPath: '/path/to/cert-authority-cert.pem',
      signingPrivateKey,
    });
    expect(cert.toString('utf-8')).toEqual('Hey! How is it going?');

    expect(spawn).toHaveBeenCalledTimes(1);
    if (isSudoExpected) {
      expect(spawn).toHaveBeenNthCalledWith(1, 'sudo', [
        expect.stringContaining('/src/create-cert'),
        expect.any(String),
      ]);
    } else {
      expect(spawn).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/src/create-cert'),
        [expect.any(String)]
      );
    }
  }
);

test('createCert error handling', async () => {
  setTimeout(() => {
    errorChunks.forEach((errorChunk) => {
      mockChildProcess.stderr.emit('data', errorChunk);
    });
    mockChildProcess.emit('close', 1);
  });

  await expect(
    createCert({
      certKeyInput: {
        type: 'public',
        key: { source: 'inline', content: 'content' },
      },
      certSubject: '//',
      expiryInDays: 365,
      signingCertAuthorityCertPath: '/path/to/cert-authority-cert.pem',
      signingPrivateKey: { source: 'tpm' },
    })
  ).rejects.toThrow('Uh oh!');
});
