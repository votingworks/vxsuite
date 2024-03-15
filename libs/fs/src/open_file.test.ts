import { err } from '@votingworks/basics';
import { tmpNameSync } from 'tmp';
import { open } from './open_file';

test('file open error', async () => {
  const path = tmpNameSync();
  expect(await open(path)).toEqual(
    err(expect.objectContaining({ code: 'ENOENT' }))
  );
});
