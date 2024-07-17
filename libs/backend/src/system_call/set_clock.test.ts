/* eslint-disable prefer-regex-literals */

import { mockOf } from '@votingworks/test-utils';
import { setClock } from './set_clock';
import { execFile } from '../exec';

jest.mock('../exec', (): typeof import('../exec') => ({
  ...jest.requireActual('../exec'),
  execFile: jest.fn(),
}));

const execMock = mockOf(execFile);

test('setClock works in daylights savings', async () => {
  await setClock({
    isoDatetime: '2020-10-03T15:00Z',
    ianaZone: 'America/Chicago',
  });

  expect(execMock).toHaveBeenNthCalledWith(1, 'sudo', [
    expect.stringMatching(
      new RegExp('^/.*/libs/backend/src/intermediate-scripts/set-clock$')
    ),
    'America/Chicago',
    '2020-10-03 10:00:00',
  ]);
});

test('setClock works in non-daylights savings', async () => {
  await setClock({
    isoDatetime: '2020-11-03T15:00Z',
    ianaZone: 'America/Chicago',
  });

  expect(execMock).toHaveBeenNthCalledWith(1, 'sudo', [
    expect.stringMatching(
      new RegExp('^/.*/libs/backend/src/intermediate-scripts/set-clock$')
    ),
    'America/Chicago',
    '2020-11-03 09:00:00',
  ]);
});

test('setClock bubbles up errors', async () => {
  // standard error is through
  execMock.mockRejectedValueOnce(
    new Error('Failed to set time: Automatic time synchronization is enabled')
  );

  await expect(
    setClock({
      isoDatetime: '2020-11-03T15:00Z',
      ianaZone: 'America/Chicago',
    })
  ).rejects.toThrowError(
    'Failed to set time: Automatic time synchronization is enabled'
  );

  // error text is in stderr
  execMock.mockRejectedValueOnce({
    stderr: 'Failed to set time: Automatic time synchronization is enabled',
  });

  await expect(
    setClock({
      isoDatetime: '2020-11-03T15:00Z',
      ianaZone: 'America/Chicago',
    })
  ).rejects.toThrowError(
    'Failed to set time: Automatic time synchronization is enabled'
  );
});
