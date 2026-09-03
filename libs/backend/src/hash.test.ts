import { Buffer } from 'node:buffer';
import { createHash, Hash } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { createWriteStream, readFileSync, WriteStream } from 'node:fs';
import { buffer } from 'node:stream/consumers';
import { HashingPassthrough } from './hash';

test('HashingPassthrough - matches regular hasher output', async () => {
  const phrase = Buffer.of(0xca, 0xfe);
  const nPhrases = 100 * 1024; // Need this to be large enough to need draining.
  const chunks = Array.from({ length: nPhrases }, () => phrase);

  const referenceHash = createHash('sha256');
  for (const chunk of chunks) referenceHash.update(chunk);

  const hashingStream = new HashingPassthrough(createHash('sha256'));
  const { outputPath, outputStream } = tempFile();

  await pipeline(Readable.from(chunks), hashingStream, outputStream);
  expect(hashingStream.digest('hex')).toEqual(referenceHash.digest('hex'));

  const output = readFileSync(outputPath);
  expect(output).toEqual(Buffer.alloc(nPhrases * phrase.length, phrase));
});

test('HashingPassthrough - handles string chunks', async () => {
  const stringChunk = 'hello';

  const referenceHash = createHash('sha256');
  referenceHash.update(stringChunk);

  const hashingStream = new HashingPassthrough(createHash('sha256'));
  const { outputPath, outputStream } = tempFile();

  await pipeline(Readable.from([stringChunk]), hashingStream, outputStream);
  expect(hashingStream.digest('hex')).toEqual(referenceHash.digest('hex'));

  const output = readFileSync(outputPath, 'utf8');
  expect(output).toEqual('hello');
});

test('HashingPassthrough.digest() asserts stream is fully hashed', () => {
  const hashingStream = new HashingPassthrough(createHash('sha256'));
  hashingStream.write(Buffer.of(0xca, 0xfe));
  expect(() => hashingStream.digest('hex')).toThrow(/incomplete hash/);
});

test.each([new Error('something went wrong'), 'not an Error object'])(
  'HashingPassthrough - propagates errors',
  async (error) => {
    const mockHash = {
      digest: vi.fn(),
      update: vi.fn(() => {
        throw error;
      }),
    } as const as unknown as Hash;

    const hashingStream = new HashingPassthrough(mockHash);
    hashingStream.write(Buffer.of(0xca, 0xfe));
    hashingStream.end();

    await expect(async () => await buffer(hashingStream)).rejects.toThrow(
      error
    );
  }
);

function tempFile(): { outputPath: string; outputStream: WriteStream } {
  const outputPath = makeTemporaryFile();
  return { outputPath, outputStream: createWriteStream(outputPath) };
}
