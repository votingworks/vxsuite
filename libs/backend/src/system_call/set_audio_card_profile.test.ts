import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { err, ok } from '@votingworks/basics';
import { pactl } from './pulse_audio';
import {
  AudioCardProfile,
  setAudioCardProfile,
  SetAudioCardProfileResult,
} from './set_audio_card_profile';

vi.mock(import('./pulse_audio.js'));
const mockPactl = vi.mocked(pactl);

const cardName = 'alsa_output.pci';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('happy path', async () => {
  mockPactl.mockResolvedValue(ok(''));

  const profile = AudioCardProfile.ANALOG;
  const logger = mockLogger({ fn: vi.fn });

  const result = setAudioCardProfile({
    cardName,
    logger,
    nodeEnv: 'production',
    profile,
  });

  await vi.runAllTimersAsync();
  expect(await result).toEqual(ok());

  expect(mockPactl).toHaveBeenCalledExactlyOnceWith('production', logger, [
    'set-card-profile',
    cardName,
    profile,
  ]);

  expect(logger.log).toHaveBeenCalledWith(LogEventId.Info, 'system', {
    message: expect.stringContaining(profile),
    disposition: 'success',
  });
});

test('is no-op in dev', async () => {
  const result = setAudioCardProfile({
    cardName,
    logger: mockLogger({ fn: vi.fn }),
    nodeEnv: 'development',
    profile: AudioCardProfile.HDMI,
  });

  await vi.runAllTimersAsync();
  expect(await result).toEqual(ok());
  expect(mockPactl).not.toHaveBeenCalled();
});

test('pactl error', async () => {
  const error = 'Failure: No such entity';
  mockPactl.mockResolvedValue(err(error));

  const logger = mockLogger({ fn: vi.fn });
  const res = setAudioCardProfile({
    cardName,
    logger,
    nodeEnv: 'production',
    profile: AudioCardProfile.ANALOG,
  });

  await vi.runAllTimersAsync();
  expect(await res).toEqual<SetAudioCardProfileResult>(
    err(expect.stringContaining(error))
  );

  expect(mockPactl).toHaveBeenCalled();
  expect(logger.log).toHaveBeenCalledWith(LogEventId.UnknownError, 'system', {
    message: expect.stringContaining(error),
    disposition: 'failure',
  });
});
