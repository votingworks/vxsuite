import { makeTemporaryFile } from '@votingworks/fixtures';
import { expect, test } from 'vitest';
import * as fc from 'fast-check';
import { sha256 } from 'js-sha256';
import { sha256File } from './sha256_file';

test('random data', async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (data) => {
      const file = makeTemporaryFile({ content: data });
      expect(await sha256File(file)).toEqual(sha256(data));
    })
  );
});

test('no file', async () => {
  await expect(sha256File('no-file')).rejects.toThrow();
});
