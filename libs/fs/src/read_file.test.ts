import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { err, ok, typedAs } from '@votingworks/basics';
import { makeTemporaryFile, makeTemporaryPath } from '@votingworks/fixtures';
import fc from 'fast-check';
import { ReadFileError, readFile } from './read_file';

test('file open error', async () => {
  const path = makeTemporaryPath();
  expect(await readFile(path, { maxSize: 1024 })).toEqual(
    err(
      typedAs<ReadFileError>({
        type: 'OpenFileError',
        error: expect.objectContaining({ code: 'ENOENT' }),
      })
    )
  );
});

test('file exceeds max size', async () => {
  await fc.assert(
    fc.asyncProperty(fc.nat(1024 * 1024 * 10), async (maxSize) => {
      const path = makeTemporaryFile({ content: 'a'.repeat(maxSize + 1) });
      expect(await readFile(path, { maxSize })).toEqual(
        err(
          typedAs<ReadFileError>({
            type: 'FileExceedsMaxSize',
            maxSize,
            fileSize: maxSize + 1,
          })
        )
      );
    })
  );
});

test('invalid maxSize', async () => {
  await expect(readFile('path', { maxSize: -1 })).rejects.toThrow(
    'maxSize must be non-negative'
  );
});

test('success', async () => {
  {
    const content = 'file contents';
    const path = makeTemporaryFile({ content });

    const buffer = (await readFile(path, { maxSize: 1024 })).unsafeUnwrap();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString('utf-8')).toEqual(content);

    expect(await readFile(path, { maxSize: 1024, encoding: 'utf-8' })).toEqual(
      ok(content)
    );
  }

  await fc.assert(
    fc.asyncProperty(fc.uint8Array(), async (content) => {
      const path = makeTemporaryFile({ content });
      expect(
        await readFile(path, {
          maxSize: content.byteLength,
        })
      ).toEqual(ok(Buffer.from(content)));
    })
  );
});
