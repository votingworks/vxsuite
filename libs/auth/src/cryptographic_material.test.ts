import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import path from 'node:path';
import * as tmp from 'tmp';
import { expect, test } from 'vitest';

import {
  cryptographicBufferToFile,
  cryptographicFileToBuffer,
  pemBuffer,
  pemFile,
} from './cryptographic_material';

tmp.setGracefulCleanup();

test('cryptographicBufferToFile', async () => {
  const certBuffer = pemBuffer('cert', Buffer.from('Whoa!', 'utf-8'));
  const certFilePath = path.join(tmp.dirSync().name, 'cert.pem');
  const certFile = await cryptographicBufferToFile(certBuffer, certFilePath);
  expect(certFile).toEqual({
    type: 'cert',
    format: 'pem',
    source: 'file',
    path: certFilePath,
  });
  expect(fs.readFileSync(certFilePath, 'utf-8')).toEqual('Whoa!');
});

test('cryptographicFileToBuffer', async () => {
  const certFilePath = path.join(tmp.dirSync().name, 'cert.pem');
  fs.writeFileSync(certFilePath, 'Whoa!');
  const certFile = pemFile('cert', certFilePath);
  const certBuffer = await cryptographicFileToBuffer(certFile);
  expect(certBuffer).toEqual({
    type: 'cert',
    format: 'pem',
    source: 'buffer',
    content: Buffer.from('Whoa!', 'utf-8'),
  });
});
