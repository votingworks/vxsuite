import { analogAndHdmi, getNodeEnv } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';

export type AudioCard = analogAndHdmi.AudioCard;

export type AudioPlayer = analogAndHdmi.Player<SoundName>;

export type AudioPlayerInterface = analogAndHdmi.PlayerInterface<SoundName>;

export type SoundName = 'alarm' | 'error' | 'success' | 'warning';

/** See {@link analogAndHdmi.Player} */
export async function newAudioPlayer(init: {
  logger: Logger;
  screenReaderEnabled: boolean;
}): Promise<AudioPlayer> {
  const nodeEnv = getNodeEnv();
  const card = await analogAndHdmi.defaultAudioCard(nodeEnv, init.logger);

  const player = analogAndHdmi.defaultAudioPlayer({
    nodeEnv,
    logger: init.logger,
    card,
    soundsDirectory: import.meta.dirname,
  });

  await player.setIsScreenReaderEnabled(init.screenReaderEnabled);

  return player;
}

export const getMockAudioPlayer = analogAndHdmi.getMockPlayer<SoundName>;
