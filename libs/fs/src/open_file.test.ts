import { expect, test } from 'vitest';
import { err } from '@votingworks/basics';
import { makeTemporaryPath } from '@votingworks/fixtures';
import { open } from './open_file';

test('file open error', async () => {
  const path = makeTemporaryPath();
  expect(await open(path)).toEqual(
    err(expect.objectContaining({ code: 'ENOENT' }))
  );
});
