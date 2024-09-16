import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

/**
 * Compute the SHA256 hash of a file. Use this to compute the hash of a
 * file rather than reading its contents into memory and computing the hash.
 * This version is more efficient and avoids memory issues.
 */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
