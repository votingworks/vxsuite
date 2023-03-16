import { Buffer } from 'buffer';

import { extractErrorMessage } from './errors';

test.each<{ error: unknown; expectedErrorMessage: string }>([
  { error: new Error('Whoa!'), expectedErrorMessage: 'Whoa!' },
  { error: 'Whoa!', expectedErrorMessage: 'Whoa!' },
  { error: Buffer.from('Whoa!', 'utf-8'), expectedErrorMessage: 'Whoa!' },
  { error: 1234, expectedErrorMessage: '1234' },
  { error: { error: 'Whoa!' }, expectedErrorMessage: '[object Object]' },
])('extractErrorMessage', ({ error, expectedErrorMessage }) => {
  expect(extractErrorMessage(error)).toEqual(expectedErrorMessage);
});
