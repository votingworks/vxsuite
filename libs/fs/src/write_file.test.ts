import { afterEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, typedAs } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import fc from 'fast-check';
import * as openRegularFile from './open_regular_file';
import { WriteFileError, writeFile } from './write_file';

afterEach(() => {
  vi.restoreAllMocks();
});

test('file open error', async () => {
  const path = join(makeTemporaryPath(), 'file');
  expect(await writeFile(path, 'contents')).toEqual(
    err(
      typedAs<WriteFileError>({
        type: 'OpenFileError',
        error: expect.objectContaining({ code: 'ENOENT' }),
      })
    )
  );
});

test('a path that is not a regular file is refused', async () => {
  expect(await writeFile(makeTemporaryDirectory(), 'contents')).toEqual(
    err(
      typedAs<WriteFileError>({
        type: 'OpenFileError',
        error: expect.objectContaining({ code: 'EISDIR' }),
      })
    )
  );
});

test.runIf(existsSync('/dev/null'))(
  'a device that opens for writing is refused',
  async () => {
    expect(await writeFile('/dev/null', 'contents')).toEqual(
      err(typedAs<WriteFileError>({ type: 'NotRegularFile' }))
    );
  }
);

test('file write error after a successful open', async () => {
  const path = makeTemporaryFile({ content: 'contents' });
  const realOpen = openRegularFile.openRegularFileForWriting;
  const closes: Array<Promise<void>> = [];
  vi.spyOn(openRegularFile, 'openRegularFileForWriting').mockImplementation(
    async (filePath) => {
      const result = await realOpen(filePath);
      if (result.isOk()) {
        vi.spyOn(result.ok(), 'writeFile').mockRejectedValue(
          Object.assign(new Error('ENOSPC: no space left on device, write'), {
            code: 'ENOSPC',
          })
        );
        const file = result.ok();
        const realClose = file.close.bind(file);
        vi.spyOn(file, 'close').mockImplementation(() => {
          const close = realClose();
          closes.push(close);
          return close;
        });
      }
      return result;
    }
  );

  expect(await writeFile(path, 'contents')).toEqual(
    err(
      typedAs<WriteFileError>({
        type: 'WriteFileError',
        error: expect.objectContaining({ code: 'ENOSPC' }),
      })
    )
  );
  // A failed write must still not leak the descriptor.
  expect(closes).toHaveLength(1);
});

test('success', async () => {
  const path = makeTemporaryPath();

  expect(await writeFile(path, 'file contents')).toEqual(ok());
  expect(readFileSync(path, 'utf-8')).toEqual('file contents');

  // An existing file is truncated rather than written over in place, so no
  // part of what was there before survives a shorter write.
  expect(await writeFile(path, 'short')).toEqual(ok());
  expect(readFileSync(path, 'utf-8')).toEqual('short');

  await fc.assert(
    fc.asyncProperty(fc.uint8Array(), async (contents) => {
      expect(await writeFile(path, contents)).toEqual(ok());
      expect(readFileSync(path)).toEqual(Buffer.from(contents));
    })
  );
});

test.runIf(existsSync('/proc/self/fd'))(
  'closes the file it wrote',
  async () => {
    const path = makeTemporaryPath();

    expect(await writeFile(path, 'contents')).toEqual(ok());

    const openFiles = readdirSync('/proc/self/fd').flatMap((fd) => {
      try {
        return [readlinkSync(join('/proc/self/fd', fd))];
      } catch {
        // The descriptor used to read the directory is gone by the time we
        // get to it.
        return [];
      }
    });
    expect(openFiles).not.toContain(path);
  }
);
