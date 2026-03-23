import { expect, test, vi } from 'vitest';

import { err, ok } from '@votingworks/basics';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { execFile } from '../exec';
import { pactl } from './pulse_audio';

vi.mock(import('../exec.js'));
const mockExecFile = vi.mocked(execFile);

test('successful run', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockExecFile.mockResolvedValue({ stderr: '', stdout: 'success' });

  const res = await pactl('production', logger, ['list', 'sinks']);
  expect(res).toEqual(ok('success'));

  expect(mockExecFile.mock.calls).toEqual([
    ['sudo', ['/vx/code/app-scripts/pactl.sh', 'list', 'sinks']],
  ]);
});

test('pactl error', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockExecFile.mockRejectedValue('execFile failed');

  const res = await pactl('development', logger, ['list', 'sinks']);
  expect(res).toEqual(err(expect.stringContaining('execFile failed')));
  expect(mockExecFile.mock.calls).toEqual([['pactl', ['list', 'sinks']]]);
});

test('pactl warning', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockExecFile.mockResolvedValue({ stderr: 'warning', stdout: 'success, but' });

  const res = await pactl('development', logger, ['list', 'sinks']);
  expect(res).toEqual(ok('success, but'));
  expect(mockExecFile.mock.calls).toEqual([['pactl', ['list', 'sinks']]]);

  expect(logger.log).toHaveBeenCalledWith(LogEventId.Info, 'system', {
    message: expect.stringContaining('warning'),
  });
});
