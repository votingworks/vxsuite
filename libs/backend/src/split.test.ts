import { expect, test, vi } from 'vitest';
import { iter } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import * as fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { WritableStream } from 'memory-streams';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { split, splitToFiles } from './split';

test('empty stream', async () => {
  const output = new WritableStream();
  const nextOutput = vi.fn().mockReturnValueOnce(output);

  await split(Readable.from([]), {
    size: 1,
    nextOutput,
  });

  expect(output.toString()).toEqual('');
  expect(nextOutput).not.toHaveBeenCalled();
});

test('empty stream to files', async () => {
  const tmpDir = makeTemporaryDirectory();

  const result = await splitToFiles(Readable.from([]), {
    size: 1,
    nextPath: (index) => join(tmpDir, `file-${index}.txt`),
  });

  expect(result).toEqual([]);
  expect(readdirSync(tmpDir)).toEqual([]);
});

test('single stream', async () => {
  const output = new WritableStream();
  const nextOutput = vi.fn().mockReturnValue(output);

  await split(Readable.from(['a']), {
    size: 1,
    nextOutput,
  });

  expect(output.toString()).toEqual('a');
  expect(nextOutput).toHaveBeenCalledTimes(1);
});

test('single file', async () => {
  const tmpDir = makeTemporaryDirectory();

  const paths = await splitToFiles(Readable.from(['a']), {
    size: 1,
    nextPath: (index) => join(tmpDir, `file-${index}.txt`),
  });

  expect(paths).toEqual([join(tmpDir, 'file-0.txt')]);
  expect(readdirSync(tmpDir)).toEqual(['file-0.txt']);
  expect(readFileSync(join(tmpDir, 'file-0.txt'), 'utf-8')).toEqual('a');
});

test('error in stream', async () => {
  await expect(
    split(Readable.from(['a']), {
      size: 1,
      nextOutput: () => {
        throw new Error('error');
      },
    })
  ).rejects.toThrowError('error');
});

test('error in file stream', async () => {
  await expect(
    splitToFiles(Readable.from(['a']), {
      size: 1,
      nextPath: () => {
        throw new Error('error');
      },
    })
  ).rejects.toThrowError('error');
});

test('single file with singleFileName', async () => {
  const tmpDir = makeTemporaryDirectory();

  const paths = await splitToFiles(Readable.from(['a']), {
    size: 1,
    nextPath: (index) => join(tmpDir, `file-${index}.txt`),
    singleFileName: 'file.txt',
  });

  expect(paths).toEqual([join(tmpDir, 'file.txt')]);
  expect(readdirSync(tmpDir)).toEqual(['file.txt']);
  expect(readFileSync(join(tmpDir, 'file.txt'), 'utf-8')).toEqual('a');
});

test('multiple streams', async () => {
  const output1 = new WritableStream();
  const output2 = new WritableStream();
  const nextOutput = vi
    .fn()
    .mockReturnValueOnce(output1)
    .mockReturnValueOnce(output2);

  await split(Readable.from(['abc', 'd']), {
    size: 2,
    nextOutput,
  });

  expect(output1.toString()).toEqual('ab');
  expect(output2.toString()).toEqual('cd');
});

test('multiple files', async () => {
  const tmpDir = makeTemporaryDirectory();
  const nextPath = vi
    .fn()
    .mockReturnValueOnce(join(tmpDir, 'file-0.txt'))
    .mockReturnValueOnce(join(tmpDir, 'file-1.txt'));

  const paths = await splitToFiles(Readable.from(['abc', 'd']), {
    size: 2,
    nextPath,
  });

  expect(paths).toEqual([
    join(tmpDir, 'file-0.txt'),
    join(tmpDir, 'file-1.txt'),
  ]);
  expect(readdirSync(tmpDir)).toEqual(['file-0.txt', 'file-1.txt']);
  expect(readFileSync(join(tmpDir, 'file-0.txt'), 'utf-8')).toEqual('ab');
  expect(readFileSync(join(tmpDir, 'file-1.txt'), 'utf-8')).toEqual('cd');
});

test('split streams contain all string data in order', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        size: fc.integer({ min: 1, max: 1000 }),
        data: fc.array(fc.string(), { minLength: 1 }),
      }),
      async ({ size, data }) => {
        const outputs: WritableStream[] = [];
        await split(Readable.from(data), {
          size,
          nextOutput() {
            const output = new WritableStream();
            outputs.push(output);
            return output;
          },
        });
        const output = outputs.map((o) => o.toString()).join('');
        expect(output).toEqual(data.join(''));
      }
    )
  );
});

test('split files contain all string data in order', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        size: fc.integer({ min: 1, max: 1000 }),
        data: fc.array(fc.string(), { minLength: 1 }),
      }),
      async ({ size, data }) => {
        const tmpDir = makeTemporaryDirectory();
        const paths = await splitToFiles(Readable.from(data), {
          size,
          nextPath: (index) => join(tmpDir, `file-${index}.txt`),
        });
        const output = paths
          .map((path) => readFileSync(path, 'utf-8'))
          .join('');
        expect(output).toEqual(data.join(''));
      }
    )
  );
});

test('split streams contain all Buffer data in order', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        size: fc.integer({ min: 1, max: 1000 }),
        data: fc.array(fc.uint8Array(), { minLength: 1 }),
      }),
      async ({ size, data }) => {
        const outputs: WritableStream[] = [];
        await split(Readable.from(data), {
          size,
          nextOutput() {
            const output = new WritableStream();
            outputs.push(output);
            return output;
          },
        });
        const output = Buffer.concat(outputs.map((o) => o.toBuffer()));
        expect(output).toEqual(Buffer.concat(data));
      }
    )
  );
});

test('split files contain all Buffer data in order', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        size: fc.integer({ min: 1, max: 1000 }),
        data: fc.array(fc.uint8Array(), { minLength: 1 }),
      }),
      async ({ size, data }) => {
        const tmpDir = makeTemporaryDirectory();
        const paths = await splitToFiles(Readable.from(data), {
          size,
          nextPath: (index) => join(tmpDir, `file-${index}.bin`),
        });
        const output = Buffer.concat(paths.map((path) => readFileSync(path)));
        expect(output).toEqual(Buffer.concat(data));
      }
    )
  );
});

test('split works like POSIX split', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        size: fc.integer({ min: 1, max: 1000 }),
        data: fc.array(fc.string({ minLength: 1 }), {
          minLength: 1,
        }),
      }),
      async ({ size, data }) => {
        // run split and collect outputs
        const streamOutputs: WritableStream[] = [];

        await split(Readable.from(data), {
          size,
          nextOutput() {
            const output = new WritableStream();
            streamOutputs.push(output);
            return output;
          },
        });

        // run POSIX split and collect outputs
        const tmpDir = makeTemporaryDirectory();
        execFileSync(
          'split',
          ['-b', size.toString(), '-', join(tmpDir, 'out-')],
          { input: data.join('') }
        );

        const fileOutputs = iter(readdirSync(tmpDir).sort()).map((file) =>
          readFileSync(join(tmpDir, file), 'utf-8')
        );

        // compare outputs
        for (const [fileOutput, output] of fileOutputs.zip(streamOutputs)) {
          expect(fileOutput).toEqual(output.toString());
        }
      }
    )
  );
});

test('splitToFiles works like POSIX split', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        size: fc.integer({ min: 1, max: 1000 }),
        data: fc.array(fc.string({ minLength: 1 }), {
          minLength: 1,
        }),
      }),
      async ({ size, data }) => {
        const tmpDir = makeTemporaryDirectory();
        const posixSplitPaths: string[] = [];

        // run split and collect outputs
        const splitToFilesPaths = await splitToFiles(Readable.from(data), {
          size,
          nextPath: (index) => join(tmpDir, `splitToFiles-${index}`),
        });

        // run POSIX split and collect outputs
        execFileSync(
          'split',
          ['-b', size.toString(), '-', join(tmpDir, 'posix-split-')],
          { input: data.join('') }
        );

        for (const file of readdirSync(tmpDir).sort()) {
          if (file.startsWith('posix-split-')) {
            posixSplitPaths.push(join(tmpDir, file));
          }
        }

        // compare outputs
        for (const [posixSplitPath, splitToFilesPath] of iter(
          posixSplitPaths
        ).zip(splitToFilesPaths)) {
          expect(readFileSync(splitToFilesPath, 'utf-8')).toEqual(
            readFileSync(posixSplitPath, 'utf-8')
          );
        }
      }
    )
  );
});
