import { err, ok, typedAs } from '@votingworks/basics';
import { Buffer } from 'buffer';
import fc from 'fast-check';
import { writeFileSync } from 'fs';
import { tmpNameSync } from 'tmp';
import { ReadFileError, readFile } from './read_file';

test('file open error', async () => {
  const path = tmpNameSync();
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
      const path = tmpNameSync();
      writeFileSync(path, 'a'.repeat(maxSize + 1));
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
    const path = tmpNameSync();
    const contents = 'file contents';

    writeFileSync(path, contents);

    const buffer = (await readFile(path, { maxSize: 1024 })).unsafeUnwrap();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString('utf-8')).toEqual(contents);

    expect(await readFile(path, { maxSize: 1024, encoding: 'utf-8' })).toEqual(
      ok(contents)
    );
  }

  await fc.assert(
    fc.asyncProperty(fc.uint8Array(), async (contents) => {
      const path = tmpNameSync();
      writeFileSync(path, contents);
      expect(
        await readFile(path, {
          maxSize: contents.byteLength,
        })
      ).toEqual(ok(Buffer.from(contents)));
    })
  );
});
