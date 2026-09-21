import { analogAndHdmi, getNodeEnv } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';

export const SoundNameValues = [
  'alarm',
  'chime',
  'error',
  'success',
  'warning',
] as const;
export type SoundName = (typeof SoundNameValues)[number];

export type AudioCard = analogAndHdmi.AudioCard;

export type AudioPlayerInterface = analogAndHdmi.PlayerInterface<SoundName>;

export type Player = analogAndHdmi.Player<SoundName>;

/** See {@link analogAndHdmi.Player} */
export async function newAudioPlayer(logger: Logger): Promise<Player> {
  const nodeEnv = getNodeEnv();

  return analogAndHdmi.defaultAudioPlayer({
    card: await analogAndHdmi.defaultAudioCard(nodeEnv, logger),
    logger,
    nodeEnv,
    soundsDirectory: import.meta.dirname,
  });
}

export const getMockAudioPlayer = analogAndHdmi.getMockPlayer<SoundName>;
