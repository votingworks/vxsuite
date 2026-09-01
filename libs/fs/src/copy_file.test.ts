import { afterEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, typedAs } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { CopyFileError, copyFile } from './copy_file';
import * as openFile from './open_file';
import * as openRegularFile from './open_regular_file';
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

test('a signal already aborted stops the copy before it opens anything', async () => {
  const source = makeTemporaryFile({ content: 'the contents of the file' });
  const destination = makeDestinationPath();
  const open = vi.spyOn(openFile, 'open');

  expect(
    await copyFile({
      source,
      destination,
      maxSize: 1024,
      signal: AbortSignal.abort(),
    })
  ).toEqual(err(typedAs<CopyFileError>({ type: 'Cancelled' })));

  expect(open).not.toHaveBeenCalled();
  expect(existsSync(destination)).toEqual(false);
});

test('aborting partway through leaves no partial destination', async () => {
  // Big enough that the abort below lands between chunks rather than after
  // the whole file has already been read.
  const content = Buffer.from('a'.repeat(READ_CHUNK_SIZE * 4));
  const source = makeTemporaryFile({ content });
  const destination = makeDestinationPath();
  const controller = new AbortController();

  const result = await copyFile({
    source,
    destination,
    maxSize: content.byteLength,
    onProgress: () => controller.abort(),
    signal: controller.signal,
  });

  expect(result).toEqual(err(typedAs<CopyFileError>({ type: 'Cancelled' })));

  // A cancelled copy is abandoned like a failed one: what landed so far is
  // not a file anyone should find.
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

test('a source that is not a regular file is refused', async () => {
  const source = makeTemporaryDirectory();
  const destination = makeDestinationPath();

  expect(await copyFile({ source, destination, maxSize: 1024 * 1024 })).toEqual(
    err(typedAs<CopyFileError>({ type: 'SourceNotRegularFile' }))
  );
  expect(existsSync(destination)).toEqual(false);
});

// If the check regresses this hangs rather than fails; see {@link
// openRegularFile} for why nothing in the caller can interrupt it.
test.runIf(process.platform === 'linux')(
  'a FIFO source is refused rather than waited on',
  async () => {
    const source = join(makeTemporaryDirectory(), 'fifo');
    execFileSync('mkfifo', [source]);
    const destination = makeDestinationPath();

    expect(await copyFile({ source, destination, maxSize: 1024 })).toEqual(
      err(typedAs<CopyFileError>({ type: 'SourceNotRegularFile' }))
    );
    expect(existsSync(destination)).toEqual(false);
  },
  5000
);

test.runIf(process.platform === 'linux')(
  'a FIFO destination is refused rather than waited on',
  async () => {
    const source = makeTemporaryFile({ content: 'contents' });
    const destination = join(makeTemporaryDirectory(), 'fifo');
    execFileSync('mkfifo', [destination]);

    // Nothing is reading it, so the open fails outright rather than reaching
    // the type check.
    expect(await copyFile({ source, destination, maxSize: 1024 })).toEqual(
      err(
        typedAs<CopyFileError>({
          type: 'WriteFileError',
          error: expect.objectContaining({ code: 'ENXIO' }),
        })
      )
    );
  },
  5000
);

test('a read that fails partway through is not blamed on the destination', async () => {
  const content = 'the contents of the file';
  const source = makeTemporaryFile({ content });
  const destination = makeDestinationPath();

  // Stands in for the errors a failing drive raises once a read is underway,
  // which a regular file cannot be talked into producing on demand.
  const realOpen = openRegularFile.openRegularFileForReading;
  vi.spyOn(openRegularFile, 'openRegularFileForReading').mockImplementation(
    async (path) => {
      const result = await realOpen(path);
      if (result.isOk()) {
        vi.spyOn(result.ok(), 'read').mockRejectedValue(
          Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' })
        );
      }
      return result;
    }
  );

  expect(await copyFile({ source, destination, maxSize: 1024 })).toEqual(
    err(
      typedAs<CopyFileError>({
        type: 'ReadFileError',
        error: expect.objectContaining({ code: 'EIO' }),
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
  const realOpen = openRegularFile.openRegularFileForWriting;
  vi.spyOn(openRegularFile, 'openRegularFileForWriting').mockImplementation(
    async (path) => {
      const result = await realOpen(path);
      if (result.isOk()) {
        const handle = result.ok();
        const realWrite = handle.write.bind(handle);
        vi.spyOn(handle, 'write').mockImplementation(((
          buffer: Buffer,
          offset: number,
          length: number
        ) =>
          realWrite(
            buffer,
            offset,
            Math.min(length, 7)
          )) as typeof handle.write);
      }
      return result;
    }
  );

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

test('a write that fails partway through is not blamed on the source', async () => {
  const source = makeTemporaryFile({ content: 'contents' });
  const destination = makeDestinationPath();

  // Stands in for the destination disk filling up mid-copy.
  const realOpen = openRegularFile.openRegularFileForWriting;
  vi.spyOn(openRegularFile, 'openRegularFileForWriting').mockImplementation(
    async (path) => {
      const result = await realOpen(path);
      if (result.isOk()) {
        vi.spyOn(result.ok(), 'write').mockRejectedValue(
          Object.assign(new Error('ENOSPC: no space left on device, write'), {
            code: 'ENOSPC',
          })
        );
      }
      return result;
    }
  );

  expect(await copyFile({ source, destination, maxSize: 100 })).toEqual(
    err(
      typedAs<CopyFileError>({
        type: 'WriteFileError',
        error: expect.objectContaining({ code: 'ENOSPC' }),
      })
    )
  );

  // A failed copy leaves nothing behind, however it failed.
  expect(existsSync(destination)).toEqual(false);
});

// A device, not a directory: a directory fails the open before the type check
// can reject it.
test.runIf(existsSync('/dev/null'))(
  'a destination that is not a regular file is refused',
  async () => {
    const source = makeTemporaryFile({ content: 'contents' });

    expect(
      await copyFile({ source, destination: '/dev/null', maxSize: 100 })
    ).toEqual(
      err(typedAs<CopyFileError>({ type: 'DestinationNotRegularFile' }))
    );
    expect(existsSync('/dev/null')).toEqual(true);
  }
);

test('invalid maxSize', async () => {
  await expect(
    copyFile({ source: 'source', destination: 'destination', maxSize: -1 })
  ).rejects.toThrow('maxSize must be non-negative');
});
