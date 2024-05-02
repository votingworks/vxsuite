import debugModule from 'debug';
import { debug } from './debug';

let names!: RegExp[];

beforeEach(() => {
  names = [...debugModule.names];
});

afterEach(() => {
  debugModule.names = names;
});

test('hex', () => {
  debugModule.enable('*');
  jest.spyOn(debugModule, 'log').mockReturnValue(undefined);
  debug('hex: %x', 255);
  expect(debugModule.log).toHaveBeenCalledWith(
    expect.stringContaining('hex: 0xff')
  );
});
