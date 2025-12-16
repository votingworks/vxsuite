import { expect, test, vi } from 'vitest';
import { mockLogger } from '@votingworks/logging';
import { AudioPlayer } from '@votingworks/backend';
import { Player, SoundName } from './player';

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

test('Player uses correct sounds directory (__dirname)', () => {
  const logger = mockLogger({ fn: vi.fn });
  // eslint-disable-next-line no-new
  new Player('development', logger, 'test.output');

  expect(MockAudioPlayer).toHaveBeenCalledWith({
    nodeEnv: 'development',
    logger,
    outputName: 'test.output',
    soundsDirectory: __dirname,
  });
});

test('Player supports all VxMark sound names', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const player = new Player('development', logger, 'test.output');

  // VxMark supports: alarm, chime, error, success, warning
  const soundNames: SoundName[] = [
    'alarm',
    'chime',
    'error',
    'success',
    'warning',
  ];

  for (const soundName of soundNames) {
    await player.play(soundName);
  }

  const mockPlayer = MockAudioPlayer.mock.results[0].value;
  expect(mockPlayer.play).toHaveBeenCalledTimes(soundNames.length);
});
