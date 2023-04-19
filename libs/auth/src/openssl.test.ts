import { Buffer } from 'buffer';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { fileSync } from 'tmp';
import {
  fakeChildProcess as newMockChildProcess,
  FakeChildProcess as MockChildProcess,
  mockOf,
} from '@votingworks/test-utils';

import { createCert, openssl } from './openssl';

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
const tempFilePaths = ['/tmp/openssl/1', '/tmp/openssl/2'] as const;
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
    responseChunks.forEach((responseChunk) => {
      mockChildProcess.stdout.emit('data', responseChunk);
    });
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
    errorChunks.forEach((errorChunk) => {
      mockChildProcess.stderr.emit('data', errorChunk);
    });
    mockChildProcess.emit('close', 1);
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Uh oh!');
});

test('openssl - provides both stderr and stdout on error', async () => {
  setTimeout(() => {
    errorChunks.forEach((errorChunk) => {
      mockChildProcess.stderr.emit('data', errorChunk);
    });
    responseChunks.forEach((responseChunk) => {
      mockChildProcess.stdout.emit('data', responseChunk);
    });
    mockChildProcess.emit('close', 1);
  });

  await expect(openssl([fileBuffers[0]])).rejects.toThrow(
    'Uh oh!\nHey! How is it going?'
  );
});

test.each<{
  certType?: 'standard' | 'certAuthorityCert';
  expiryInDays: number;
  expectedOpensslCertCreationRequestParams: string[];
}>([
  {
    certType: undefined,
    expiryInDays: 1000,
    expectedOpensslCertCreationRequestParams: [
      'x509',
      '-req',
      '-CA',
      '/path/to/cert-authority-cert.pem',
      '-CAkey',
      '/path/to/private-key.pem',
      '-passin',
      'pass:1234',
      '-CAcreateserial',
      '-CAserial',
      '/tmp/serial.txt',
      '-in',
      tempFilePaths[1],
      '-force_pubkey',
      '/path/to/public-key.pem',
      '-days',
      '1000',
    ],
  },
  {
    certType: 'certAuthorityCert',
    expiryInDays: 1000,
    expectedOpensslCertCreationRequestParams: [
      'x509',
      '-req',
      '-CA',
      '/path/to/cert-authority-cert.pem',
      '-CAkey',
      '/path/to/private-key.pem',
      '-passin',
      'pass:1234',
      '-CAcreateserial',
      '-CAserial',
      '/tmp/serial.txt',
      '-in',
      tempFilePaths[1],
      '-force_pubkey',
      '/path/to/public-key.pem',
      '-days',
      '1000',
      '-extensions',
      'v3_ca',
      '-extfile',
      expect.stringContaining('/certs/openssl.cnf'),
    ],
  },
])(
  'createCert - certType = $certType, expiryInDays = $expiryInDays',
  async ({
    certType,
    expiryInDays,
    expectedOpensslCertCreationRequestParams,
  }) => {
    setTimeout(() => {
      mockChildProcess.emit('close', 0);
    });
    setTimeout(() => {
      mockChildProcess.emit('close', 0);
    });
    setTimeout(() => {
      mockChildProcess.emit('close', 0);
    });

    await createCert({
      certSubject: '//',
      certType,
      expiryInDays,
      publicKeyToSign: '/path/to/public-key.pem',
      signingCertAuthorityCert: '/path/to/cert-authority-cert.pem',
      signingPrivateKey: '/path/to/private-key.pem',
      signingPrivateKeyPassword: '1234',
    });

    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
      'ecparam',
      '-genkey',
      '-name',
      'prime256v1',
      '-noout',
    ]);
    expect(spawn).toHaveBeenNthCalledWith(2, 'openssl', [
      'req',
      '-new',
      '-config',
      expect.stringContaining('/certs/openssl.cnf'),
      '-key',
      tempFilePaths[0],
      '-subj',
      '//',
    ]);
    expect(spawn).toHaveBeenNthCalledWith(
      3,
      'openssl',
      expectedOpensslCertCreationRequestParams
    );
  }
);
