import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { iter } from '@votingworks/basics';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { open } from './open_file';
import { READ_CHUNK_SIZE, readChunksWithinLimit } from './read_chunks';
import { FileExceedsMaxSizeError } from './file_exceeds_max_size_error';

async function collect(
  content: string,
  maxSize: number,
  options?: { reuseBuffer?: boolean }
): Promise<Buffer[]> {
  const fd = (await open(makeTemporaryFile({ content }))).unsafeUnwrap();
  try {
    return await iter(readChunksWithinLimit(fd, maxSize, options)).toArray();
  } finally {
    await fd.close();
  }
}

test('a file is delivered in chunks of at most the chunk size', async () => {
  const content = 'a'.repeat(READ_CHUNK_SIZE * 2 + 1);
  const chunks = await collect(content, content.length);

  expect(chunks.map((chunk) => chunk.byteLength)).toEqual([
    READ_CHUNK_SIZE,
    READ_CHUNK_SIZE,
    1,
  ]);
  expect(Buffer.concat(chunks).toString()).toEqual(content);
});

test('chunks are the caller`s to keep by default', async () => {
  const content = 'a'.repeat(READ_CHUNK_SIZE + 1);
  const [first, second] = await collect(content, content.length);

  expect(first?.buffer === second?.buffer).toEqual(false);
});

test('reuseBuffer reads the whole file through one buffer', async () => {
  const content = 'a'.repeat(READ_CHUNK_SIZE + 1);
  const [first, second] = await collect(content, content.length, {
    reuseBuffer: true,
  });

  // The reason this is opt-in: a caller that kept the first chunk would find it
  // holding the second chunk's bytes.
  expect(first?.buffer === second?.buffer).toEqual(true);
});

test('a file is cut off once it exceeds the limit', async () => {
  await expect(
    collect('a'.repeat(READ_CHUNK_SIZE * 2), READ_CHUNK_SIZE)
  ).rejects.toThrow(FileExceedsMaxSizeError);
});
