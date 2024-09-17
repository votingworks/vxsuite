/* istanbul ignore file */
import { exec } from '@votingworks/backend';
import { NODE_ENV } from '../globals';

const PULSE_AUDIO_SINK_ID_VSAP_SOUND_CARD = '0';

/**
 * Audio output port names for VSAP BMD sound card. These are fairly
 * hardware-specific and not guaranteed to work in other environments.
 */
export enum AudioOutput {
  SPEAKER = 'analog-output-speaker',
  HEADPHONES = 'analog-output-headphones',
}

/**
 * Sets the active audio output port.
 * NOTE: This is only guaranteed to work on production hardware.
 */
export async function setAudioOutput(outputName: AudioOutput): Promise<void> {
  if (NODE_ENV !== 'production') {
    return;
  }

  const command = [
    'sudo',
    '/vx/code/app-scripts/pactl.sh',
    'set-sink-port',
    PULSE_AUDIO_SINK_ID_VSAP_SOUND_CARD,
    outputName,
  ].join(' ');

  let errorOutput: string;

  try {
    ({ stderr: errorOutput } = await exec(command));
  } catch (error) {
    throw new Error(`Unable to set audio output: ${error}}`);
  }

  if (errorOutput) {
    throw new Error(`Unable to set audio output: ${errorOutput}}`);
  }
}
