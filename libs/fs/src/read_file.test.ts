import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { err, ok, typedAs } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import fc from 'fast-check';
import { ReadFileError, readFile } from './read_file';
import { READ_CHUNK_SIZE } from './read_chunks';

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

test('file read error after a successful open', async () => {
  // A directory opens fine and then fails the read itself, with EISDIR. Before
  // the try/finally around the read this threw past the `Result` contract and
  // leaked the file descriptor.
  const path = makeTemporaryDirectory();

  // Comfortably above the size a directory inode stats at, so the size check
  // passes and the read itself is what fails.
  const result = await readFile(path, { maxSize: 1024 * 1024 });
  expect(result).toEqual(
    err({
      type: 'ReadFileError',
      error: expect.objectContaining({
        message: expect.stringContaining('EISDIR'),
      }),
    })
  );
});

test('file exceeds max size', async () => {
  await fc.assert(
    fc.asyncProperty(fc.nat(1024 * 1024), async (maxSize) => {
      const path = makeTemporaryFile({ content: 'a'.repeat(maxSize + 1) });
      expect(await readFile(path, { maxSize })).toEqual(
        err(
          typedAs<ReadFileError>({
            type: 'FileExceedsMaxSize',
            maxSize,
          })
        )
      );
    })
  );
});

test('a file that grows past the limit while being read is refused', async () => {
  const path = makeTemporaryFile({ content: '' });
  const maxSize = 4 * 1024;

  // Written after the file exists but before it is read, standing in for a file
  // whose reported size and actual contents disagree. Nothing here consults
  // `stat`, so the limit is enforced on what the read actually produces.
  writeFileSync(path, 'a'.repeat(maxSize * 4));

  expect(await readFile(path, { maxSize })).toEqual(
    err(typedAs<ReadFileError>({ type: 'FileExceedsMaxSize', maxSize }))
  );
});

test('a file larger than one read chunk is read whole', async () => {
  const content = 'a'.repeat(READ_CHUNK_SIZE * 2 + 1);
  const path = makeTemporaryFile({ content });

  expect(await readFile(path, { maxSize: content.length })).toEqual(
    ok(Buffer.from(content))
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
