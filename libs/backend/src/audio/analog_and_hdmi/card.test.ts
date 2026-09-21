import { expect, test, vi } from 'vitest';
import { Logger, mockLogger } from '@votingworks/logging';
import { err, ok } from '@votingworks/basics';
import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioCardProfile,
  getAudioCardName,
  GetAudioCardNameParams,
  setAudioCardProfile,
  SetAudioCardProfileParams,
  setAudioVolume,
} from '../../system_call/index.js';
import { type NODE_ENV } from '../../globals.js';
import {
  DEFAULT_HEADPHONE_VOLUME,
  DEFAULT_SPEAKER_VOLUME,
  defaultAudioCard,
  MAX_CARD_DETECTION_RETRIES,
} from './card.js';

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
  expect(mockGetCardName).toHaveBeenCalledWith<[GetAudioCardNameParams]>({
    logger,
    nodeEnv: 'production',
    maxRetries: MAX_CARD_DETECTION_RETRIES,
  });
  expect(speakerVolume).toEqual(DEFAULT_SPEAKER_VOLUME);
  expect(headphoneVolume).toEqual(DEFAULT_HEADPHONE_VOLUME);
});

test('setVolume()', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockGetCardName.mockResolvedValueOnce(ok(cardName));
  mockSetProfile.mockResolvedValue(ok());
  mockSetVolume.mockResolvedValue(ok());

  const card = await defaultAudioCard('production', logger);
  await card.setVolume(98);

  expect(mockSetVolume).toHaveBeenCalledWith({
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
  expect(mockSetProfile).toHaveBeenLastCalledWith<[SetAudioCardProfileParams]>({
    cardName,
    logger,
    nodeEnv,
    profile,
  });
}
