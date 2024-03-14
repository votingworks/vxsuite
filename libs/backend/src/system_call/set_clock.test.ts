import { beforeEach, expect, mock, test } from 'bun:test';
import { setClock } from './set_clock';

const execFile = mock();

void mock.module('../exec', () => ({ execFile }));

beforeEach(() => {
  execFile.mockClear();
});

test('setClock works in daylight saving time', async () => {
  await setClock({
    isoDatetime: '2020-10-03T15:00Z',
    ianaZone: 'America/Chicago',
  });

  expect(execFile).toHaveBeenNthCalledWith(1, 'sudo', [
    '-n',
    'timedatectl',
    'set-timezone',
    'America/Chicago',
  ]);

  expect(execFile).toHaveBeenNthCalledWith(2, 'sudo', [
    '-n',
    'timedatectl',
    'set-time',
    '2020-10-03 10:00:00',
  ]);
});

test('setClock works in standard time', async () => {
  await setClock({
    isoDatetime: '2020-11-03T15:00Z',
    ianaZone: 'America/Chicago',
  });

  expect(execFile).toHaveBeenNthCalledWith(1, 'sudo', [
    '-n',
    'timedatectl',
    'set-timezone',
    'America/Chicago',
  ]);

  expect(execFile).toHaveBeenNthCalledWith(2, 'sudo', [
    '-n',
    'timedatectl',
    'set-time',
    '2020-11-03 09:00:00',
  ]);
});

test('setClock bubbles up errors', () => {
  // standard error is through
  execFile.mockRejectedValueOnce(
    new Error('Failed to set time: Automatic time synchronization is enabled')
  );

  expect(
    setClock({
      isoDatetime: '2020-11-03T15:00Z',
      ianaZone: 'America/Chicago',
    })
  ).rejects.toThrow(
    'Failed to set time: Automatic time synchronization is enabled'
  );

  // error text is in stderr
  execFile.mockRejectedValueOnce({
    stderr: 'Failed to set time: Automatic time synchronization is enabled',
  });

  expect(
    setClock({
      isoDatetime: '2020-11-03T15:00Z',
      ianaZone: 'America/Chicago',
    })
  ).rejects.toThrow(
    'Failed to set time: Automatic time synchronization is enabled'
  );
});
