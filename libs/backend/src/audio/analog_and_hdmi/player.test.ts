import { beforeEach, expect, test, vi, type Mocked } from 'vitest';
import { type Logger, mockLogger } from '@votingworks/logging';
import { deferred, sleep } from '@votingworks/basics';
import { expectToHaveBeenCalledWith } from '@votingworks/test-utils/expect';
import { Player } from './player.js';
import { AudioCard } from './card.js';
import { newAudioPlayer, type AudioPlayerInterface } from '../player.js';
import { AUDIO_DEVICE_DEFAULT_SINK } from '../../system_call/pulse_audio.js';
import type { NODE_ENV } from '../../globals.js';

vi.mock('./card.js');

const mockPlayer: Mocked<AudioPlayerInterface> = {
  play: vi.fn(() => Promise.resolve(undefined)),
};
vi.mock(import('../player.js'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    newAudioPlayer: vi.fn(() => mockPlayer),
  };
});

type SoundName = 'alarm' | 'success';

const MOCK_SOUNDS_DIR = '/mock/sounds';
const mockNewAudioPlayer = vi.mocked(newAudioPlayer);

beforeEach(() => {
  vi.resetAllMocks();
});

test('Player uses correct sounds directory (import.meta.dirname)', () => {
  const logger = mockLogger({ fn: vi.fn });
  const mockCard = new AudioCard('test', logger, { name: 'test.card' });

  newPlayer('development', logger, mockCard);

  expectToHaveBeenCalledWith(mockNewAudioPlayer, {
    nodeEnv: 'development',
    logger,
    outputName: AUDIO_DEVICE_DEFAULT_SINK,
    soundsDirectory: MOCK_SOUNDS_DIR,
  });
});

test('Player supports all VxScan sound names', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const mockCard = new AudioCard('test', logger, { name: 'test.card' });
  const player = newPlayer('development', logger, mockCard);

  const soundNames: SoundName[] = ['alarm', 'success'];

  for (const soundName of soundNames) {
    await player.play(soundName);
  }

  expect(mockPlayer.play).toHaveBeenCalledTimes(soundNames.length);
});

test('toggles output when screen reader is enabled', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const mockCard = new AudioCard('test', logger, { name: 'test.card' });
  const player = newPlayer('production', logger, mockCard);

  await player.setIsScreenReaderEnabled(true);
  expect(mockCard.useHeadphones).toHaveBeenCalledOnce();
  vi.mocked(mockCard.useHeadphones).mockClear();
  vi.mocked(mockCard.setVolume).mockClear();

  const deferredOutputSwitch = deferred<void>();
  vi.mocked(mockCard.useSpeaker).mockReturnValueOnce(
    deferredOutputSwitch.promise
  );

  const deferredPlay = player.play('success');

  expect(mockCard.useSpeaker).toHaveBeenCalledOnce();

  deferredOutputSwitch.resolve();

  // Sound shouldn't be played until port change has resolved:
  expect(mockPlayer.play).not.toHaveBeenCalled();

  vi.mocked(mockCard.useHeadphones).mockResolvedValueOnce();
  await sleep(0); // Wait for "play" request.
  expectToHaveBeenCalledWith(mockPlayer.play, 'success');

  // Expect switch back to headphones after sound is done playing:
  await deferredPlay;
  expect(mockCard.useHeadphones).toHaveBeenCalledOnce();

  // Volume should not be set when using speaker for sound effects:
  expect(mockCard.setVolume).not.toHaveBeenCalled();
});

test('does not toggle output when screen reader is disabled', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const mockCard = new AudioCard('test', logger, { name: 'test.card' });
  const player = newPlayer('production', logger, mockCard);

  await player.setIsScreenReaderEnabled(false);
  expect(mockCard.useSpeaker).toHaveBeenCalledOnce();
  vi.mocked(mockCard.useSpeaker).mockClear();

  await player.play('success');

  expectToHaveBeenCalledWith(mockPlayer.play, 'success');
  expect(mockCard.useSpeaker).not.toHaveBeenCalled();
  expect(mockCard.useHeadphones).not.toHaveBeenCalled();
});

function newPlayer(nodeEnv: NODE_ENV, logger: Logger, card: AudioCard) {
  return new Player<SoundName>({
    nodeEnv,
    logger,
    card,
    soundsDirectory: MOCK_SOUNDS_DIR,
  });
}
