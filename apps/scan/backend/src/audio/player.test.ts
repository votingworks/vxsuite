import { expect, test, vi } from 'vitest';
import { mockLogger } from '@votingworks/logging';
import {
  AudioPlayer,
  AudioPort,
  setBuiltinAudioPort,
} from '@votingworks/backend';
import { deferred, sleep } from '@votingworks/basics';
import { MAX_PORT_CHANGE_RETRIES, Player, SoundName } from './player';

vi.mock('@votingworks/backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@votingworks/backend')>();
  return {
    ...actual,
    AudioPlayer: vi.fn().mockImplementation(() => ({
      play: vi.fn().mockResolvedValue(undefined),
    })),
    setBuiltinAudioPort: vi.fn(),
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

test('Player supports all VxScan sound names', async () => {
  const logger = mockLogger({ fn: vi.fn });
  const player = new Player('development', logger, 'test.output');

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
  const player = new Player('production', logger, 'test.output');

  const deferredPortSwitch = deferred<void>();
  const mockSetPort = vi.mocked(setBuiltinAudioPort);
  mockSetPort.mockReturnValueOnce(deferredPortSwitch.promise);

  const deferredPlay = player.play('success');

  type SetPortArgs = Parameters<typeof setBuiltinAudioPort>;
  expect(mockSetPort).toHaveBeenLastCalledWith<SetPortArgs>(
    'production',
    AudioPort.SPEAKER,
    logger,
    { maxRetries: MAX_PORT_CHANGE_RETRIES }
  );

  deferredPortSwitch.resolve();

  // Sound shouldn't be played until port change has resolved:
  const mockPlayer = MockAudioPlayer.mock.results[0].value;
  expect(mockPlayer.play).not.toHaveBeenCalled();

  mockSetPort.mockResolvedValueOnce();
  await sleep(0); // Wait for "play" request.
  expect(mockPlayer.play).toHaveBeenCalledWith<[SoundName]>('success');

  // Expect switch back to headphones after sound is done playing:
  await deferredPlay;
  expect(mockSetPort).toHaveBeenLastCalledWith<SetPortArgs>(
    'production',
    AudioPort.HEADPHONES,
    logger,
    { maxRetries: MAX_PORT_CHANGE_RETRIES }
  );
});
