import { expect, test, vi } from 'vitest';
import { Logger, mockLogger } from '@votingworks/logging';
import {
  AUDIO_DEVICE_DEFAULT_SINK,
  AudioCardProfile,
  getAudioCardName,
  GetAudioCardNameParams,
  setAudioCardProfile,
  SetAudioCardProfileParams,
  setAudioVolume,
} from '@votingworks/backend';
import { err, ok } from '@votingworks/basics';
import { AudioCard, MAX_CARD_DETECTION_RETRIES } from './card';
import { NODE_ENV } from '../globals';

vi.mock('@votingworks/backend');
const mockGetCardName = vi.mocked(getAudioCardName);
const mockSetProfile = vi.mocked(setAudioCardProfile);
const mockSetVolume = vi.mocked(setAudioVolume);

const cardName = 'test.pci';

test('default()', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockGetCardName.mockResolvedValueOnce(ok(cardName));

  await AudioCard.default('production', logger);
  expect(mockGetCardName).toHaveBeenCalledWith<[GetAudioCardNameParams]>({
    logger,
    nodeEnv: 'production',
    maxRetries: MAX_CARD_DETECTION_RETRIES,
  });
});

test('setVolume()', async () => {
  const logger = mockLogger({ fn: vi.fn });
  mockGetCardName.mockResolvedValueOnce(ok(cardName));
  mockSetVolume.mockResolvedValueOnce(ok());

  const card = await AudioCard.default('production', logger);
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
  mockSetProfile.mockResolvedValueOnce(ok());

  const card = await AudioCard.default('production', logger);
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
  mockSetProfile.mockResolvedValueOnce(ok());

  const card = await AudioCard.default('development', logger);
  await card.useSpeaker();
  expectOutputSwitch('development', logger, AudioCardProfile.HDMI);

  mockSetProfile.mockResolvedValueOnce(err('invalid profile'));
  await expect(() => card.useSpeaker()).rejects.toThrow(
    'unable to switch audio output'
  );
});

function expectOutputSwitch(
  nodeEnv: typeof NODE_ENV,
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
