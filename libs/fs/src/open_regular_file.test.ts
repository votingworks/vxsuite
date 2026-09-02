import { afterEach, expect, test, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, typedAs } from '@votingworks/basics';
import {
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import * as openFile from './open_file';
import {
  OpenRegularFileError,
  openRegularFileForReading,
  openRegularFileForWriting,
} from './open_regular_file';

afterEach(() => {
  vi.restoreAllMocks();
});

test('opens a regular file and reads it', async () => {
  const path = makeTemporaryFile({ content: 'contents' });

  const file = (await openRegularFileForReading(path)).unsafeUnwrap();
  try {
    expect((await file.readFile()).toString('utf-8')).toEqual('contents');
  } finally {
    await file.close();
  }
});

test('a file that is not there is an open failure', async () => {
  expect(
    await openRegularFileForReading(
      join(makeTemporaryDirectory(), 'does-not-exist')
    )
  ).toEqual(
    err(
      typedAs<OpenRegularFileError>({
        type: 'OpenFileError',
        error: expect.objectContaining({ code: 'ENOENT' }),
      })
    )
  );
});

test('a directory is not a regular file', async () => {
  expect(await openRegularFileForReading(makeTemporaryDirectory())).toEqual(
    err(typedAs<OpenRegularFileError>({ type: 'NotRegularFile' }))
  );
});

test.runIf(process.platform === 'linux')(
  'a FIFO is not a regular file, and does not block',
  async () => {
    const path = join(makeTemporaryDirectory(), 'fifo');
    execFileSync('mkfifo', [path]);

    expect(await openRegularFileForReading(path)).toEqual(
      err(typedAs<OpenRegularFileError>({ type: 'NotRegularFile' }))
    );
  },
  5000
);

test.runIf(existsSync('/dev/zero'))(
  'a device is not a regular file',
  async () => {
    expect(await openRegularFileForReading('/dev/zero')).toEqual(
      err(typedAs<OpenRegularFileError>({ type: 'NotRegularFile' }))
    );
  }
);

test('a descriptor whose type cannot be determined is an open failure', async () => {
  const path = makeTemporaryFile({ content: 'contents' });
  const realOpen = openFile.open;
  vi.spyOn(openFile, 'open').mockImplementation(async (...args) => {
    const result = await realOpen(...args);
    if (result.isOk()) {
      vi.spyOn(result.ok(), 'stat').mockRejectedValue(
        Object.assign(new Error('EBADF: bad file descriptor, fstat'), {
          code: 'EBADF',
        })
      );
    }
    return result;
  });

  expect(await openRegularFileForReading(path)).toEqual(
    err(
      typedAs<OpenRegularFileError>({
        type: 'OpenFileError',
        error: expect.objectContaining({ code: 'EBADF' }),
      })
    )
  );
});

test('opens a file for writing, creating it', async () => {
  const path = join(makeTemporaryDirectory(), 'new-file');

  const file = (await openRegularFileForWriting(path)).unsafeUnwrap();
  try {
    await file.write(Buffer.from('contents'), 0, 8);
  } finally {
    await file.close();
  }

  expect(readFileSync(path, 'utf-8')).toEqual('contents');
});

test('truncates a file it opens for writing', async () => {
  const path = makeTemporaryFile({ content: 'a much longer previous value' });

  const file = (await openRegularFileForWriting(path)).unsafeUnwrap();
  try {
    await file.write(Buffer.from('short'), 0, 5);
  } finally {
    await file.close();
  }

  expect(readFileSync(path, 'utf-8')).toEqual('short');
});

test.runIf(existsSync('/dev/null'))(
  'a device is not opened for writing',
  async () => {
    expect(await openRegularFileForWriting('/dev/null')).toEqual(
      err(typedAs<OpenRegularFileError>({ type: 'NotRegularFile' }))
    );
  }
);

test.runIf(process.platform === 'linux')(
  'a FIFO with nothing reading it fails the open rather than blocking',
  async () => {
    const path = join(makeTemporaryDirectory(), 'fifo');
    execFileSync('mkfifo', [path]);

    expect(await openRegularFileForWriting(path)).toEqual(
      err(
        typedAs<OpenRegularFileError>({
          type: 'OpenFileError',
          error: expect.objectContaining({ code: 'ENXIO' }),
        })
      )
    );
  },
  5000
);

test('a directory cannot be opened for writing at all', async () => {
  expect(await openRegularFileForWriting(makeTemporaryDirectory())).toEqual(
    err(
      typedAs<OpenRegularFileError>({
        type: 'OpenFileError',
        error: expect.objectContaining({ code: 'EISDIR' }),
      })
    )
  );
});
