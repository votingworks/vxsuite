import { afterEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, typedAs } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { CopyFileError, copyFile } from './copy_file';
import * as openFile from './open_file';
import { READ_CHUNK_SIZE } from './read_chunks';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeDestinationPath(): string {
  return join(makeTemporaryDirectory(), 'destination');
}

test('copies a file, reporting what it actually held', async () => {
  const content = 'the contents of the file';
  const source = makeTemporaryFile({ content });
  const destination = makeDestinationPath();

  const result = await copyFile({
    source,
    destination,
    maxSize: content.length,
  });

  expect(result.unsafeUnwrap()).toEqual({ size: content.length });
  expect(readFileSync(destination, 'utf-8')).toEqual(content);
});

test('hashes the contents during the copy when asked', async () => {
  const content = 'the contents of the file';
  const source = makeTemporaryFile({ content });
  const destination = makeDestinationPath();

  const result = await copyFile({
    source,
    destination,
    maxSize: content.length,
    digest: 'sha256',
  });

  expect(result.unsafeUnwrap()).toEqual({
    size: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
});

test('copies a file larger than one read chunk', async () => {
  const content = Buffer.from('a'.repeat(READ_CHUNK_SIZE * 2 + 1));
  const source = makeTemporaryFile({ content });
  const destination = makeDestinationPath();

  const progress: number[] = [];
  const result = await copyFile({
    source,
    destination,
    maxSize: content.byteLength,
    digest: 'sha256',
    onProgress: (copiedBytes) => progress.push(copiedBytes),
  });

  // Progress is reported once per chunk as it lands, ending at the full size.
  expect(progress).toEqual([
    READ_CHUNK_SIZE,
    READ_CHUNK_SIZE * 2,
    READ_CHUNK_SIZE * 2 + 1,
  ]);

  expect(result.unsafeUnwrap()).toEqual({
    size: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
  expect(readFileSync(destination)).toEqual(content);
});

test('a file exactly at the limit is still copied', async () => {
  const source = makeTemporaryFile({ content: 'a'.repeat(100) });
  const destination = makeDestinationPath();

  expect(
    (await copyFile({ source, destination, maxSize: 100 })).unsafeUnwrap()
  ).toEqual({ size: 100 });
});

test('a file that grows past the limit while being copied is abandoned', async () => {
  const source = makeTemporaryFile({ content: '' });
  const destination = makeDestinationPath();
  const maxSize = 4 * 1024;

  // Written after the file exists but before it is copied: nothing here
  // consults `stat`, so the limit is enforced on what the read produces.
  writeFileSync(source, 'a'.repeat(maxSize * 4));

  expect(await copyFile({ source, destination, maxSize })).toEqual(
    err(typedAs<CopyFileError>({ type: 'FileExceedsMaxSize', maxSize }))
  );

  // The limit is what a caller has agreed to spend, so a source that turns out
  // to be bigger than it claimed must not leave more than that behind.
  expect(existsSync(destination)).toEqual(false);
});

test('a source that cannot be opened is reported as such', async () => {
  const destination = makeDestinationPath();

  expect(
    await copyFile({
      source: join(makeTemporaryDirectory(), 'does-not-exist'),
      destination,
      maxSize: 100,
    })
  ).toEqual(
    err(
      typedAs<CopyFileError>({
        type: 'OpenFileError',
        error: expect.objectContaining({ code: 'ENOENT' }),
      })
    )
  );
  expect(existsSync(destination)).toEqual(false);
});

test('a source that opens but cannot be read is not blamed on the destination', async () => {
  // A directory opens fine and fails the read itself, with EISDIR, standing in
  // for the errors a failing drive raises partway through.
  const source = makeTemporaryDirectory();
  const destination = makeDestinationPath();

  expect(
    await copyFile({
      source,
      destination,
      maxSize: 1024 * 1024,
    })
  ).toEqual(
    err(
      typedAs<CopyFileError>({
        type: 'ReadFileError',
        error: expect.objectContaining({
          message: expect.stringContaining('EISDIR'),
        }),
      })
    )
  );
  expect(existsSync(destination)).toEqual(false);
});

test('a destination that cannot be opened is not blamed on the source', async () => {
  const source = makeTemporaryFile({ content: 'contents' });

  expect(
    await copyFile({
      source,
      destination: join(makeTemporaryDirectory(), 'no-such-directory', 'file'),
      maxSize: 100,
    })
  ).toEqual(
    err(
      typedAs<CopyFileError>({
        type: 'WriteFileError',
        error: expect.objectContaining({ code: 'ENOENT' }),
      })
    )
  );
});

test('a short write is completed rather than trusted', async () => {
  const content = 'the contents of the file';
  const source = makeTemporaryFile({ content });
  const destination = makeDestinationPath();

  // `write` may accept fewer bytes than offered without erroring. Wrap the
  // destination handle so every write takes at most a few bytes, forcing the
  // copy to notice and finish the job.
  const realOpen = openFile.open;
  vi.spyOn(openFile, 'open').mockImplementation(async (path, flags, mode) => {
    const result = await realOpen(path, flags, mode);
    if (flags === 'w' && result.isOk()) {
      const handle = result.ok();
      const realWrite = handle.write.bind(handle);
      vi.spyOn(handle, 'write').mockImplementation(((
        buffer: Buffer,
        offset: number,
        length: number
      ) =>
        realWrite(buffer, offset, Math.min(length, 7))) as typeof handle.write);
    }
    return result;
  });

  const result = await copyFile({
    source,
    destination,
    maxSize: content.length,
    digest: 'sha256',
  });

  expect(result.unsafeUnwrap()).toEqual({
    size: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  });
  expect(readFileSync(destination, 'utf-8')).toEqual(content);
});

// `/dev/full` opens fine and fails every write with ENOSPC, which is what a
// destination disk filling up mid-copy looks like. It is Linux-only, so this is
// skipped elsewhere; CI, where coverage is enforced, runs on Linux. As a device
// rather than a regular file, it also exercises cleanup declining to unlink a
// destination that cannot be holding a partial copy.
test.runIf(existsSync('/dev/full'))(
  'a write that fails partway through is not blamed on the source',
  async () => {
    const source = makeTemporaryFile({ content: 'contents' });

    expect(
      await copyFile({ source, destination: '/dev/full', maxSize: 100 })
    ).toEqual(
      err(
        typedAs<CopyFileError>({
          type: 'WriteFileError',
          error: expect.objectContaining({ code: 'ENOSPC' }),
        })
      )
    );
    expect(existsSync('/dev/full')).toEqual(true);
  }
);

test('invalid maxSize', async () => {
  await expect(
    copyFile({ source: 'source', destination: 'destination', maxSize: -1 })
  ).rejects.toThrow('maxSize must be non-negative');
});
