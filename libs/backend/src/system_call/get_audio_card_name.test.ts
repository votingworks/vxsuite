import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { err, ok } from '@votingworks/basics';
import { LogEventId, mockLogger } from '@votingworks/logging';

import { getAudioCardName } from './get_audio_card_name';
import { pactl } from './pulse_audio';

vi.mock('./pulse_audio.js');

const mockPactl = vi.mocked(pactl);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('command successful', async () => {
  const nodeEnv = 'production';
  const name = 'alsa_output.pci-0000_00_01.0';
  const logger = mockLogger({ fn: vi.fn });

  mockPactl.mockResolvedValueOnce(err('failed 1st attempt'));
  mockPactl.mockResolvedValueOnce(ok(JSON.stringify([{ name }])));

  const res = getAudioCardName({ logger, maxRetries: 1, nodeEnv });
  await vi.runAllTimersAsync();
  expect(await res).toEqual(ok(name));

  // Expect retry after 1st failed attempt:
  expect(mockPactl.mock.calls).toEqual([
    ['production', logger, ['-fjson', 'list', 'cards']],
    ['production', logger, ['-fjson', 'list', 'cards']],
  ]);

  expect(logger.log).toHaveBeenCalledWith(LogEventId.Info, 'system', {
    disposition: 'success',
    message: expect.stringContaining(name),
  });
});

test('command successful - no cards found', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockPactl.mockResolvedValue(ok(JSON.stringify([])));

  expect(await getAudioCardName({ logger, nodeEnv: 'development' })).toEqual(
    err(expect.stringContaining('no audio cards found'))
  );
  expect(mockPactl.mock.calls).toEqual([
    ['development', logger, ['-fjson', 'list', 'cards']],
  ]);
});

test('pactl error', async () => {
  const nodeEnv = 'production';
  const logger = mockLogger({ fn: vi.fn });
  mockPactl.mockResolvedValue(err('access denied'));

  const res = getAudioCardName({ logger, maxRetries: 2, nodeEnv });
  await vi.runAllTimersAsync();
  expect(await res).toEqual(err('access denied'));
  expect(mockPactl).toHaveBeenCalledTimes(3);

  const logParams = [
    LogEventId.UnknownError,
    'system',
    {
      disposition: 'failure',
      message: expect.stringContaining('card detection failed'),
    },
  ] as const;
  expect(vi.mocked(logger.log).mock.calls).toEqual([logParams, logParams]);
});

test('pactl output parse error', async () => {
  const nodeEnv = 'production';
  const logger = mockLogger({ fn: vi.fn });

  mockPactl.mockResolvedValueOnce(ok('not json'));

  let res = getAudioCardName({ logger, maxRetries: 2, nodeEnv });
  await vi.runAllTimersAsync();
  expect(await res).toEqual(err(expect.stringContaining('SyntaxError')));
  expect(mockPactl).toHaveBeenCalledOnce(); // Shouldn't retry on parse errors.

  mockPactl.mockReset();
  mockPactl.mockResolvedValueOnce(ok('[{"not":"valid"}]'));

  res = getAudioCardName({ logger, maxRetries: 2, nodeEnv });
  await vi.runAllTimersAsync();
  expect(await res).toEqual(err(expect.objectContaining({ name: 'ZodError' })));
  expect(mockPactl).toHaveBeenCalledOnce();
});
