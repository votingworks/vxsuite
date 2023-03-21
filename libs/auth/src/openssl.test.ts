import { Buffer } from 'buffer';
import { spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { v4 as uuid } from 'uuid';
import {
  fakeChildProcess as newMockChildProcess,
  FakeChildProcess as MockChildProcess,
  mockOf,
} from '@votingworks/test-utils';

import { createCert, openssl } from './openssl';

jest.mock('child_process');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    unlink: jest.fn(),
    writeFile: jest.fn(),
  },
}));
jest.mock('uuid');

let mockChildProcess: MockChildProcess;
let mockUuid = 0;

beforeEach(() => {
  mockChildProcess = newMockChildProcess();
  mockOf(spawn).mockImplementation(() => mockChildProcess);

  mockOf(existsSync).mockImplementation(() => true);
  mockOf(fs.mkdir).mockImplementation(() => Promise.resolve(undefined));
  mockOf(fs.unlink).mockImplementation(() => Promise.resolve());
  mockOf(fs.writeFile).mockImplementation(() => Promise.resolve());

  mockUuid = 0;
  mockOf(uuid).mockImplementation(() => {
    mockUuid += 1;
    return `${mockUuid}`;
  });
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
  mockOf(existsSync).mockImplementationOnce(() => false);
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

  expect(existsSync).toHaveBeenCalledTimes(2);
  expect(existsSync).toHaveBeenNthCalledWith(1, '/tmp/openssl');
  expect(existsSync).toHaveBeenNthCalledWith(2, '/tmp/openssl');
  expect(fs.mkdir).toHaveBeenCalledTimes(1);
  expect(fs.mkdir).toHaveBeenNthCalledWith(1, '/tmp/openssl');
  expect(uuid).toHaveBeenCalledTimes(2);
  expect(fs.writeFile).toHaveBeenCalledTimes(2);
  expect(fs.writeFile).toHaveBeenNthCalledWith(
    1,
    tempFilePaths[0],
    fileBuffers[0]
  );
  expect(fs.writeFile).toHaveBeenNthCalledWith(
    2,
    tempFilePaths[1],
    fileBuffers[1]
  );
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
    'some',
    tempFilePaths[0],
    'command',
    tempFilePaths[1],
  ]);
  expect(fs.unlink).toHaveBeenCalledTimes(2);
  expect(fs.unlink).toHaveBeenNthCalledWith(1, tempFilePaths[0]);
  expect(fs.unlink).toHaveBeenNthCalledWith(2, tempFilePaths[1]);
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

  expect(existsSync).toHaveBeenCalledTimes(0);
  expect(fs.mkdir).toHaveBeenCalledTimes(0);
  expect(uuid).toHaveBeenCalledTimes(0);
  expect(fs.writeFile).toHaveBeenCalledTimes(0);
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', ['some', 'command']);
  expect(fs.unlink).toHaveBeenCalledTimes(0);
});

test('openssl - no standard output', async () => {
  setTimeout(() => {
    mockChildProcess.emit('close', 0);
  });

  const response = await openssl(['some', 'command']);
  expect(response).toEqual(Buffer.from([]));
});

test('openssl - error creating working directory', async () => {
  mockOf(existsSync).mockImplementationOnce(() => false);
  mockOf(fs.mkdir).mockImplementationOnce(() =>
    Promise.reject(new Error('Whoa!'))
  );

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Whoa!');
});

test('openssl - error writing temp file', async () => {
  mockOf(fs.writeFile).mockImplementationOnce(() =>
    Promise.reject(new Error('Whoa!'))
  );

  await expect(openssl([fileBuffers[0]])).rejects.toThrow('Whoa!');
});

test('openssl - error cleaning up temp files', async () => {
  mockOf(fs.unlink).mockImplementationOnce(() =>
    Promise.reject(new Error('Whoa!'))
  );
  setTimeout(() => {
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
  expiryInDays?: number;
  expectedSecondOpensslCallParams: string[];
}>([
  {
    certType: undefined,
    expiryInDays: undefined,
    expectedSecondOpensslCallParams: [
      'x509',
      '-req',
      '-CA',
      '/path/to/cert-authority-cert.pem',
      '-CAkey',
      '/path/to/private-key.pem',
      '-passin',
      `pass:1234`,
      '-CAcreateserial',
      '-in',
      tempFilePaths[0],
      '-force_pubkey',
      '/path/to/public-key.pem',
      '-days',
      '365',
    ],
  },
  {
    certType: 'certAuthorityCert',
    expiryInDays: 1000,
    expectedSecondOpensslCallParams: [
      'x509',
      '-req',
      '-CA',
      '/path/to/cert-authority-cert.pem',
      '-CAkey',
      '/path/to/private-key.pem',
      '-passin',
      `pass:1234`,
      '-CAcreateserial',
      '-in',
      tempFilePaths[0],
      '-force_pubkey',
      '/path/to/public-key.pem',
      '-days',
      '1000',
      '-extensions',
      'v3_ca',
      '-extfile',
      '/path/to/openssl.cnf',
    ],
  },
])(
  'createCert - certType = $certType, expiryInDays = $expiryInDays',
  async ({ certType, expiryInDays, expectedSecondOpensslCallParams }) => {
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
      opensslConfig: '/path/to/openssl.cnf',
      publicKeyToSign: '/path/to/public-key.pem',
      signingCertAuthorityCert: '/path/to/cert-authority-cert.pem',
      signingPrivateKey: '/path/to/private-key.pem',
      signingPrivateKeyPassword: '1234',
    });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenNthCalledWith(1, 'openssl', [
      'req',
      '-new',
      '-config',
      '/path/to/openssl.cnf',
      '-key',
      '/path/to/private-key.pem',
      '-passin',
      'pass:1234',
      '-subj',
      '//',
    ]);
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'openssl',
      expectedSecondOpensslCallParams
    );
  }
);
