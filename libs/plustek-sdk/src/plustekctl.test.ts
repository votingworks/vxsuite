import { findBinaryPath } from './plustekctl'

test('plustekctl', async () => {
  expect((await findBinaryPath()).unwrap()).toEqual('plustekctl')
})
