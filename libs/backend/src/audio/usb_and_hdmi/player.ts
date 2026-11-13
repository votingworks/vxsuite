/* eslint-disable vx/gts-no-return-type-only-generics */
/* eslint-disable vx/gts-jsdoc */

import type { Logger } from '@votingworks/logging';

import { newAudioPlayer } from '../player.js';
import type { NODE_ENV } from '../../globals.js';
import type { BuiltinAudio } from '../../system_call/get_audio_info.js';
import { DEFAULT_SPEAKER_VOLUME_PCT } from '../config.js';
import { setAudioVolume } from '../../system_call/set_audio_volume.js';

export interface PlayerInterface<Sound extends string> {
  play(soundName: Sound): Promise<void>;
}

export interface PlayerInit {
  device: BuiltinAudio;
  logger: Logger;
  nodeEnv: NODE_ENV;
  soundsDirectory: string;
}

/**
 * Returns a new system audio player for the given device, with defaults
 * configured.
 *
 * Intended for use on v4 VxComputer machines with ELO screens, with screen
 * reader audio going through the headphone port of the accessible controller
 * and system audio through the built-in screen speaker.
 */
export async function defaultAudioPlayer<Sound extends string>(
  init: PlayerInit
): Promise<PlayerInterface<Sound>> {
  const player = newAudioPlayer({
    nodeEnv: init.nodeEnv,
    logger: init.logger,
    outputName: init.device.name,
    soundsDirectory: init.soundsDirectory,
  });

  const volumeResult = await setAudioVolume({
    logger: init.logger,
    nodeEnv: init.nodeEnv,
    sinkName: init.device.name,
    volumePct: DEFAULT_SPEAKER_VOLUME_PCT,
  });
  volumeResult.assertOk('unable to set audio volume');

  return player;
}
