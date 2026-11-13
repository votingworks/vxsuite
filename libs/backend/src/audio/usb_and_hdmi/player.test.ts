import { test, vi, type Mocked } from 'vitest';

import { mockLogger } from '@votingworks/logging';
import { expectToHaveBeenCalledWith } from '@votingworks/test-utils/expect';

import { ok } from '@votingworks/basics';
import { defaultAudioPlayer } from './player.js';
import { newAudioPlayer, type AudioPlayerInterface } from '../player.js';
import { setAudioVolume } from '../../system_call/set_audio_volume.js';
import { DEFAULT_SPEAKER_VOLUME_PCT } from '../config.js';

vi.mock(import('../../system_call/set_audio_volume.js'));

const mockPlayer: Mocked<AudioPlayerInterface> = {
  play: vi.fn().mockResolvedValue(undefined),
};
vi.mock(import('../player.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    newAudioPlayer: vi.fn(() => mockPlayer),
  };
});

const mockNewAudioPlayer = vi.mocked(newAudioPlayer);

test('defaultAudioPlayer forwards init to Player constructor', async () => {
  vi.mocked(setAudioVolume).mockResolvedValueOnce(ok());
  const logger = mockLogger({ fn: vi.fn });

  const player = await defaultAudioPlayer({
    device: { headphonesActive: false, name: 'alsa-pci' },
    logger,
    nodeEnv: 'development',
    soundsDirectory: '/path/to/sounds',
  });

  expectToHaveBeenCalledWith(mockNewAudioPlayer, {
    soundsDirectory: '/path/to/sounds',
    nodeEnv: 'development',
    logger,
    outputName: 'alsa-pci',
  });

  expectToHaveBeenCalledWith(vi.mocked(setAudioVolume), {
    nodeEnv: 'development',
    logger,
    sinkName: 'alsa-pci',
    volumePct: DEFAULT_SPEAKER_VOLUME_PCT,
  });

  await player.play('test-sound');
  expectToHaveBeenCalledWith(mockPlayer.play, 'test-sound');
});
