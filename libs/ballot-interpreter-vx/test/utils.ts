import { assert } from '@votingworks/utils';
import MemoryStream from 'memorystream';
import { Readable } from 'stream';
import { main } from '../src/cli';

export function randomInt(
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  assert(min <= max);
  return (min + Math.random() * (max - min + 1)) | 0;
}

async function readStream(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}

export async function runCli(
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout = new MemoryStream();
  const stderr = new MemoryStream();
  const code = await main(
    ['node', 'ballot-interpreter-vx', ...args],
    Readable.from('') as NodeJS.ReadStream,
    stdout as NodeJS.WriteStream,
    stderr as NodeJS.WriteStream
  );
  stdout.end();
  stderr.end();
  return {
    code,
    stdout: await readStream(stdout),
    stderr: await readStream(stderr),
  };
}
