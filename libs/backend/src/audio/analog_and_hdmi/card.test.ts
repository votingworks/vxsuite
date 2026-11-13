import { expect, test, vi } from 'vitest';
import { type Logger, mockLogger } from '@votingworks/logging';
import { err, ok } from '@votingworks/basics';
import {
  expectToHaveBeenCalledWith,
  expectToHaveBeenLastCalledWith,
} from '@votingworks/test-utils/expect';
import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioCardProfile,
  getAudioCardName,
  setAudioCardProfile,
  setAudioVolume,
} from '../../system_call/index.js';
import type { NODE_ENV } from '../../globals.js';
import { defaultAudioCard } from './card.js';
import {
  DEFAULT_HEADPHONE_VOLUME_PCT,
  DEFAULT_SPEAKER_VOLUME_PCT,
  MAX_AUDIO_DETECTION_RETRIES,
  MIN_AUDIO_DETECTION_RETRY_DELAY_MS,
} from '../config.js';

vi.mock('../../system_call/index.js');
const mockGetCardName = vi.mocked(getAudioCardName);
const mockSetProfile = vi.mocked(setAudioCardProfile);
const mockSetVolume = vi.mocked(setAudioVolume);

const cardName = 'test.pci';

test('default()', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockGetCardName.mockResolvedValueOnce(ok(cardName));

  let currentProfile: AudioCardProfile | undefined;
  mockSetProfile.mockImplementation((p) => {
    expect(p.cardName).toEqual(cardName);
    expect(p.nodeEnv).toEqual<NODE_ENV>('production');
    expect(p.logger).toEqual(logger);
    currentProfile = p.profile;

    return Promise.resolve(ok());
  });

  let speakerVolume = 0;
  let headphoneVolume = 0;
  mockSetVolume.mockImplementation((p) => {
    expect(currentProfile).not.toBeUndefined();
    expect(p.sinkName).toEqual(AUDIO_DEVICE_DEFAULT_SINK);
    expect(p.nodeEnv).toEqual<NODE_ENV>('production');
    expect(p.logger).toEqual(logger);

    if (currentProfile === AudioCardProfile.HDMI) {
      speakerVolume = p.volumePct;
    } else {
      headphoneVolume = p.volumePct;
    }

    return Promise.resolve(ok());
  });

  await defaultAudioCard('production', logger);
  expectToHaveBeenCalledWith(mockGetCardName, {
    baseRetryDelayMs: MIN_AUDIO_DETECTION_RETRY_DELAY_MS,
    logger,
    nodeEnv: 'production',
    maxRetries: MAX_AUDIO_DETECTION_RETRIES,
  });
  expect(speakerVolume).toEqual(DEFAULT_SPEAKER_VOLUME_PCT);
  expect(headphoneVolume).toEqual(DEFAULT_HEADPHONE_VOLUME_PCT);
});

test('setVolume()', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockGetCardName.mockResolvedValueOnce(ok(cardName));
  mockSetProfile.mockResolvedValue(ok());
  mockSetVolume.mockResolvedValue(ok());

  const card = await defaultAudioCard('production', logger);
  await card.setVolume(98);

  expectToHaveBeenCalledWith(mockSetVolume, {
    logger,
    nodeEnv: 'production',
    sinkName: AUDIO_DEVICE_DEFAULT_SINK,
    volumePct: 98,
  });

  mockSetVolume.mockResolvedValueOnce(err({ code: 'pactlError', error: 'no' }));
  await expect(() => card.setVolume(98)).rejects.toThrow(
    'unable to set audio volume'
  );
});

test('useHeadphones()', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockGetCardName.mockResolvedValueOnce(ok(cardName));
  mockSetProfile.mockResolvedValue(ok());
  mockSetVolume.mockResolvedValue(ok());

  const card = await defaultAudioCard('production', logger);
  await card.useHeadphones();
  expectOutputSwitch('production', logger, AudioCardProfile.ANALOG);

  mockSetProfile.mockResolvedValueOnce(err('invalid profile'));
  await expect(() => card.useHeadphones()).rejects.toThrow(
    'unable to switch audio output'
  );
});

test('useSpeaker()', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockGetCardName.mockResolvedValueOnce(ok(cardName));
  mockSetProfile.mockResolvedValue(ok());
  mockSetVolume.mockResolvedValue(ok());

  const card = await defaultAudioCard('development', logger);
  await card.useSpeaker();
  expectOutputSwitch('development', logger, AudioCardProfile.HDMI);

  mockSetProfile.mockResolvedValueOnce(err('invalid profile'));
  await expect(() => card.useSpeaker()).rejects.toThrow(
    'unable to switch audio output'
  );
});

function expectOutputSwitch(
  nodeEnv: NODE_ENV,
  logger: Logger,
  profile: AudioCardProfile
) {
  expectToHaveBeenLastCalledWith(mockSetProfile, {
    cardName,
    logger,
    nodeEnv,
    profile,
  });
}
