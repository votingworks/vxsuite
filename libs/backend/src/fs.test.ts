import { Buffer } from 'buffer';
import { err, ok } from '@votingworks/basics';
import { tmpNameSync } from 'tmp';
import { unlink, writeFile } from 'fs/promises';
import fc from 'fast-check';
import { readFile } from './fs';

async function withTmpFile<T>(
  callback: (path: string) => Promise<T>
): Promise<T> {
  const path = tmpNameSync();
  try {
    return await callback(path);
  } finally {
    try {
      await unlink(path);
    } catch {
      // ignore
    }
  }
}

test('readFile with a file that does not exist', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 1024 * 1024 }),
      async (maxSize) => {
        await withTmpFile(async (path) => {
          const result = await readFile(path, { maxSize });

          expect(result).toEqual(
            err({
              type: 'file-not-found',
              path,
            })
          );
        });
      }
    )
  );
});

test('readFile with a file that is too large', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 1024 * 1024 }),
      fc.integer({ min: 1, max: 100 }),
      async (maxSize, overflowSize) => {
        const fileSize = maxSize + overflowSize;
        await withTmpFile(async (path) => {
          await writeFile(path, Buffer.alloc(fileSize));
          const result = await readFile(path, { maxSize });
          expect(result).toEqual(
            err({
              type: 'file-too-large',
              path,
              maxSize,
            })
          );
        });
      }
    )
  );
});

test('readFile with a file that is not too large', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc
        .tuple(
          // Generate a file size that is less than the maximum size.
          fc.integer({ min: 0, max: 1024 }),
          fc.integer({ min: 1, max: 1024 })
        )
        .filter(([fileSize, maxSize]) => fileSize <= maxSize)
        // Generate random file contents.
        .chain(([fileSize, maxSize]) =>
          fc.tuple(
            fc.constant(maxSize),
            fc.uint8Array({ minLength: fileSize, maxLength: fileSize })
          )
        )
        // Convert to a Buffer.
        .map(
          ([maxSize, contents]) => [maxSize, Buffer.from(contents)] as const
        ),
      async ([maxSize, contents]) => {
        await withTmpFile(async (path) => {
          await writeFile(path, contents);
          const result = await readFile(path, { maxSize });
          expect(result).toEqual(ok(contents));
        });
      }
    )
  );
});
