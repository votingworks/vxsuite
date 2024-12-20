import { beforeEach, expect, Mock, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { fileSync } from 'tmp';
import {
  mockChildProcess as newMockChildProcess,
  MockChildProcess,
  mockOf,
} from '@votingworks/test-utils';

import {
  createCert,
  createCertGivenCertSigningRequest,
  createCertHelper,
  CreateCertInput,
  createCertSigningRequest,
  manageOpensslConfig,
  openssl,
  parseCreateCertInput,
  parseSignMessageInputExcludingMessage,
  signMessage,
  signMessageHelper,
  SignMessageInput,
  SignMessageInputExcludingMessage,
} from './cryptography';

vi.mock('node:child_process');
vi.mock('tmp');

let mockChildProcess: MockChildProcess;
let nextTempFileName = 0;
const tempFileRemoveCallbacks: Mock[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockChildProcess = newMockChildProcess();
  mockOf(spawn).mockImplementation(() => mockChildProcess);

  nextTempFileName = 0;
  mockOf(fileSync).mockImplementation(() => {
    nextTempFileName += 1;
    const removeCallback = vi.fn();
    tempFileRemoveCallbacks.push(removeCallback);
    return {
      fd: nextTempFileName,
      name: `/tmp/openssl/${nextTempFileName}`,
      removeCallback,
    };
  });
  vi.spyOn(fs, 'writeFile').mockResolvedValue();

  vi.spyOn(process.stdin, 'pipe').mockImplementation(() => new Writable());
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
const successExitCode = 0;
const errorExitCode = 1;

test('openssl', async () => {
  setTimeout(() => {
    responseChunks.forEach((responseChunk) => {
      mockChildProcess.stdout.emit('data', responseChunk);
    });
    mockChildProcess.stderr.emit('data', Buffer.from('Some warning', 'utf-8'));
    mockChildProcess.emit('close', successExitCode);
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
    mockChildProcess.emit('close', successExitCode);
  });

  const response = await openssl(['some', 'command']);
  expect(response.toString('utf-8')).toEqual('Hey! How is it going?');

  expect(fileSync).toHaveBeenCalledTimes(0);
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', ['some', 'command']);
});

test('openssl - no standard output', async () => {
  setTimeout(() => {
    mockChildProcess.emit('close', successExitCode);
  });

  const response = await openssl(['some', 'command']);
  expect(response).toEqual(Buffer.of());
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
      tempFileRemoveCallback.mockImplementationOnce(() => {
        throw new Error('Whoa!');
      });
    }
    mockChildProcess.emit('close', successExitCode);
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Whoa!');
});

test('openssl - process exits with an error code', async () => {
  setTimeout(() => {
    for (const errorChunk of errorChunks) {
      mockChildProcess.stderr.emit('data', errorChunk);
    }
    mockChildProcess.emit('close', errorExitCode);
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
    mockChildProcess.emit('close', errorExitCode);
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow(
    'Uh oh!\nHey! How is it going?'
  );
});

//
// Cert creation functions
//

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
    mockChildProcess.emit('close', successExitCode);
  });

  await createCertSigningRequest({
    certKey: { source: 'tpm' },
    certSubject: '//',
  });

  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
    'req',
    '-config',
    expect.stringContaining('/config/openssl.vx-tpm.cnf'),
    '-new',
    '-key',
    'handle:0x81000001',
    '-propquery',
    '?provider=tpm2',
    '-subj',
    '//',
  ]);
});

test('createCertGivenCertSigningRequest', async () => {
  setTimeout(() => {
    mockChildProcess.emit('close', successExitCode);
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
  expectedOpensslCsrCreationRequestParams: string[];
  expectedOpensslCertCreationRequestParams: string[];
  areOpensslConfigManagementCommandsExpected: boolean;
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
    expectedOpensslCsrCreationRequestParams: [
      'req',
      '-config',
      expect.stringContaining('/config/openssl.vx.cnf'),
      '-new',
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
    areOpensslConfigManagementCommandsExpected: false,
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
    expectedOpensslCsrCreationRequestParams: [
      'req',
      '-config',
      expect.stringContaining('/config/openssl.vx.cnf'),
      '-new',
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
      'handle:0x81000001',
      '-propquery',
      '?provider=tpm2',
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
    areOpensslConfigManagementCommandsExpected: true,
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
    expectedOpensslCsrCreationRequestParams: [
      'req',
      '-config',
      expect.stringContaining('/config/openssl.vx.cnf'),
      '-new',
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
      '-extfile',
      expect.stringContaining('/config/openssl.vx.cnf'),
      '-extensions',
      'v3_ca',
    ],
    areOpensslConfigManagementCommandsExpected: false,
  },
])(
  'createCertHelper - $description',
  async ({
    certKeyInput,
    certType,
    signingPrivateKey,
    expectedOpensslCsrCreationRequestParams,
    expectedOpensslCertCreationRequestParams,
    areOpensslConfigManagementCommandsExpected,
  }) => {
    setTimeout(() => {
      mockChildProcess.emit('close', successExitCode);
    });
    setTimeout(() => {
      mockChildProcess.emit('close', successExitCode);
    });
    if (areOpensslConfigManagementCommandsExpected) {
      setTimeout(() => {
        mockChildProcess.emit('close', successExitCode);
      });
      setTimeout(() => {
        mockChildProcess.emit('close', successExitCode);
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

    expect(spawn).toHaveBeenCalledTimes(
      areOpensslConfigManagementCommandsExpected ? 4 : 2
    );
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'openssl',
      expectedOpensslCsrCreationRequestParams
    );
    if (areOpensslConfigManagementCommandsExpected) {
      expect(spawn).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          '/src/intermediate-scripts/manage-openssl-config'
        ),
        ['override-for-tpm-use']
      );
      expect(spawn).toHaveBeenNthCalledWith(
        3,
        'openssl',
        expectedOpensslCertCreationRequestParams
      );
      expect(spawn).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining(
          '/src/intermediate-scripts/manage-openssl-config'
        ),
        ['restore-default']
      );
    } else {
      expect(spawn).toHaveBeenNthCalledWith(
        2,
        'openssl',
        expectedOpensslCertCreationRequestParams
      );
    }
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
      mockChildProcess.emit('close', successExitCode);
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
        expect.stringContaining('/src/intermediate-scripts/create-cert'),
        expect.any(String),
      ]);
    } else {
      expect(spawn).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/src/intermediate-scripts/create-cert'),
        [expect.any(String)]
      );
    }
  }
);

//
// Message signing functions
//

test.each<SignMessageInputExcludingMessage>([
  { signingPrivateKey: { source: 'file', path: '/path/to/private-key.pem' } },
  { signingPrivateKey: { source: 'tpm' } },
])(
  'parseSignMessageInputExcludingMessage success',
  (signMessageInputExcludingMessage) => {
    expect(
      parseSignMessageInputExcludingMessage(
        JSON.stringify(signMessageInputExcludingMessage)
      )
    ).toEqual(signMessageInputExcludingMessage);
  }
);

test.each<string>([
  '',
  JSON.stringify({}),
  JSON.stringify({ signingPrivateKey: { source: 'file', oops: 'oops' } }),
])(
  'parseSignMessageInputExcludingMessage error',
  (signMessageInputExcludingMessage) => {
    expect(() =>
      parseSignMessageInputExcludingMessage(signMessageInputExcludingMessage)
    ).toThrow();
  }
);

test.each<{
  description: string;
  signingPrivateKey: SignMessageInput['signingPrivateKey'];
  expectedOpensslSignatureRequestParams: string[];
}>([
  {
    description: 'signing with private key file',
    signingPrivateKey: { source: 'file', path: '/path/to/private-key.pem' },
    expectedOpensslSignatureRequestParams: [
      'pkeyutl',
      '-sign',
      '-inkey',
      '/path/to/private-key.pem',
    ],
  },
  {
    description: 'signing with TPM private key',
    signingPrivateKey: { source: 'tpm' },
    expectedOpensslSignatureRequestParams: [
      'pkeyutl',
      '-config',
      expect.stringContaining('/config/openssl.vx-tpm.cnf'),
      '-sign',
      '-inkey',
      'handle:0x81000001',
      '-propquery',
      '?provider=tpm2',
    ],
  },
])(
  'signMessageHelper - $description',
  async ({ signingPrivateKey, expectedOpensslSignatureRequestParams }) => {
    setTimeout(() => {
      mockChildProcess.emit('close', successExitCode);
    });
    setTimeout(() => {
      mockChildProcess.emit('close', successExitCode);
    });

    await signMessageHelper({ signingPrivateKey });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
      'dgst',
      '-sha256',
      '-binary',
    ]);
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'openssl',
      expectedOpensslSignatureRequestParams
    );
    expect(process.stdin.pipe).toHaveBeenCalledTimes(1);
    expect(process.stdin.pipe).toHaveBeenNthCalledWith(
      1,
      mockChildProcess.stdin
    );
  }
);

test.each<{
  signingPrivateKey: SignMessageInput['signingPrivateKey'];
  isSudoExpected: boolean;
}>([
  {
    signingPrivateKey: { source: 'file', path: '/path/to/private-key.pem' },
    isSudoExpected: false,
  },
  {
    signingPrivateKey: { source: 'tpm' },
    isSudoExpected: true,
  },
])('signMessage', async ({ signingPrivateKey, isSudoExpected }) => {
  setTimeout(() => {
    responseChunks.forEach((responseChunk) => {
      mockChildProcess.stdout.emit('data', responseChunk);
    });
    mockChildProcess.emit('close', successExitCode);
  });

  const message = Readable.from('abcd');
  vi.spyOn(message, 'pipe');

  const messageSignature = await signMessage({
    message,
    signingPrivateKey,
  });
  expect(messageSignature.toString('utf-8')).toEqual('Hey! How is it going?');

  expect(spawn).toHaveBeenCalledTimes(1);
  if (isSudoExpected) {
    expect(spawn).toHaveBeenNthCalledWith(1, 'sudo', [
      expect.stringContaining('/src/intermediate-scripts/sign-message'),
      expect.any(String),
    ]);
  } else {
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/src/intermediate-scripts/sign-message'),
      [expect.any(String)]
    );
  }
  expect(message.pipe).toHaveBeenCalledTimes(1);
  expect(message.pipe).toHaveBeenNthCalledWith(1, mockChildProcess.stdin);
});

test('manageOpensslConfig with addSudo', async () => {
  setTimeout(() => {
    mockChildProcess.emit('close', successExitCode);
  });

  await manageOpensslConfig('restore-default', { addSudo: true });

  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'sudo', [
    expect.stringContaining('/src/intermediate-scripts/manage-openssl-config'),
    'restore-default',
  ]);
});
