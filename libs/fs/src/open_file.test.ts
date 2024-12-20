import { expect, test } from 'vitest';
import { err } from '@votingworks/basics';
import { makeTmpFile } from '../test/utils';
import { open } from './open_file';

test('file open error', async () => {
  const path = makeTmpFile();
  expect(await open(path)).toEqual(
    err(expect.objectContaining({ code: 'ENOENT' }))
  );
});
