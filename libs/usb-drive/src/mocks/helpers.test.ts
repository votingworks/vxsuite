import { describe, expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { readFile } from 'node:fs/promises';
import { writeMockFileTree } from './helpers';

describe('writeMockFileTree', () => {
  test('Buffer value', async () => {
    const dir = makeTemporaryDirectory();
    const path = join(dir, 'file');
    writeMockFileTree(path, Buffer.of(1, 2, 3));
    await expect(readFile(path)).resolves.toEqual(Buffer.of(1, 2, 3));
  });

  test('string value is a path', async () => {
    const dir = makeTemporaryDirectory();
    const path = join(dir, 'file');
    writeMockFileTree(path, __filename);
    await expect(readFile(path, 'utf-8')).resolves.toEqual(
      await readFile(__filename, 'utf-8')
    );
  });

  test('object value is a file tree', async () => {
    const dir = makeTemporaryDirectory();
    writeMockFileTree(dir, {
      buffer: Buffer.of(1, 2, 3),
      copy: __filename,
      subdir: {
        text: Buffer.from('hello world'),
      },
    });
    await expect(readFile(join(dir, 'buffer'))).resolves.toEqual(
      Buffer.of(1, 2, 3)
    );
    await expect(readFile(join(dir, 'copy'), 'utf-8')).resolves.toEqual(
      await readFile(__filename, 'utf-8')
    );
    await expect(readFile(join(dir, 'subdir/text'), 'utf-8')).resolves.toEqual(
      'hello world'
    );
  });
});
