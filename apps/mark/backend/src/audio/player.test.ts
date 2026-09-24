import { expect, test, vi } from 'vitest';
import { mockLogger } from '@votingworks/logging';
import { analogAndHdmi, getNodeEnv } from '@votingworks/backend';
import { type AudioCard, newAudioPlayer, type Player } from './player.js';

test('Player uses correct sounds directory (import.meta.dirname)', async () => {
  const mockCard = { mock: 'card' } as unknown as AudioCard;
  vi.spyOn(analogAndHdmi, 'defaultAudioCard').mockResolvedValue(mockCard);

  const mockPlayer = { mock: 'player' } as unknown as Player;
  const mockPlayerInit = vi
    .spyOn(analogAndHdmi, 'defaultAudioPlayer')
    .mockResolvedValue(mockPlayer);

  const logger = mockLogger({ fn: vi.fn });
  await newAudioPlayer(logger);

  expect(mockPlayerInit).toHaveBeenCalledWith<[analogAndHdmi.PlayerInit]>({
    card: mockCard,
    nodeEnv: getNodeEnv(),
    logger,
    soundsDirectory: import.meta.dirname,
  });
});
