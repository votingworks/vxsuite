import { expect, test } from 'vitest';
import * as fc from 'fast-check';
import { fileSync } from 'tmp';
import * as fs from 'node:fs/promises';
import { sha256 } from 'js-sha256';
import { sha256File } from './sha256_file';

test('random data', async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (data) => {
      const file = fileSync();
      await fs.writeFile(file.name, data);
      expect(await sha256File(file.name)).toEqual(sha256(data));
    })
  );
});

test('no file', async () => {
  await expect(sha256File('no-file')).rejects.toThrow();
});
