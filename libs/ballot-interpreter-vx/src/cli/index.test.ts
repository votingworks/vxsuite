import { parseGlobalOptions } from '.';

test('unknown option', () => {
  expect(
    parseGlobalOptions([
      'node',
      'ballot-interpreter-vx',
      '--nope',
    ]).unsafeUnwrapErr().message
  ).toEqual('Unknown global option: --nope');
});
