import { findBinaryPath } from './plustekctl';

test('plustekctl', async () => {
  expect((await findBinaryPath()).unsafeUnwrap()).toEqual('plustekctl');
});
