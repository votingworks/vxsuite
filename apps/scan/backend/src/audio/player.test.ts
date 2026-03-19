import { expect, test, vi } from 'vitest';
import { mockLogger } from '@votingworks/logging';
import { AUDIO_DEVICE_DEFAULT_SINK, AudioPlayer } from '@votingworks/backend';
import { deferred, sleep } from '@votingworks/basics';
import { Player, SoundName } from './player.js';
import { AudioCard } from './card.js';

vi.mock('./card.js');

vi.mock('@votingworks/backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@votingworks/backend')>();
  return {
    ...actual,
    AudioPlayer: vi.fn().mockImplementation(() => ({
      play: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

const MockAudioPlayer = vi.mocked(AudioPlayer);

test('Player uses correct sounds directory (import.meta.dirname)', () => {
  const logger = mockLogger({ fn: vi.fn });
  const mockCard = new AudioCard('test', logger, { name: 'test.card' });

  // eslint-disable-next-line no-new
  new Player('development', logger, mockCard);

  expect(MockAudioPlayer).toHaveBeenCalledWith({
    nodeEnv: 'development',
    logger,
    outputName: AUDIO_DEVICE_DEFAULT_SINK,
    soundsDirectory: import.meta.dirname,
  });
});

test('Player supports all VxScan sound names', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const mockCard = new AudioCard('test', logger, { name: 'test.card' });
  const player = new Player('development', logger, mockCard);

  // VxScan supports: alarm, error, success, warning (no chime)
  const soundNames: SoundName[] = ['alarm', 'error', 'success', 'warning'];

  for (const soundName of soundNames) {
    await player.play(soundName);
  }

  const mockPlayer = MockAudioPlayer.mock.results[0].value;
  expect(mockPlayer.play).toHaveBeenCalledTimes(soundNames.length);
});

test('temporarily switches to speaker port before playing', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const mockCard = new AudioCard('test', logger, { name: 'test.card' });
  const player = new Player('production', logger, mockCard);

  const deferredOutputSwitch = deferred<void>();
  vi.mocked(mockCard.useSpeaker).mockReturnValueOnce(
    deferredOutputSwitch.promise
  );

  const deferredPlay = player.play('success');

  expect(mockCard.useSpeaker).toHaveBeenCalledOnce();

  deferredOutputSwitch.resolve();

  // Sound shouldn't be played until port change has resolved:
  const mockPlayer = MockAudioPlayer.mock.results[0].value;
  expect(mockPlayer.play).not.toHaveBeenCalled();

  vi.mocked(mockCard.useHeadphones).mockResolvedValueOnce();
  await sleep(0); // Wait for "play" request.
  expect(mockPlayer.play).toHaveBeenCalledWith<[SoundName]>('success');

  // Expect switch back to headphones after sound is done playing:
  await deferredPlay;
  expect(mockCard.useHeadphones).toHaveBeenCalledOnce();
});
