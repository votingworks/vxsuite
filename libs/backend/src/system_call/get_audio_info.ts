import { LogEventId, Logger } from '@votingworks/logging';
import { z } from 'zod/v4';
import { execFile } from '../exec';
import { NODE_ENV } from '../scan_globals';

/** System audio info. */
export interface AudioInfo {
  builtin?: BuiltinAudio;
  usb?: UsbAudio;
}

/**
 * Device info for a machine's built-in audio card.
 */
export interface BuiltinAudio {
  headphonesActive: boolean;
  name: string;
}

/**
 * Device info for a connected USB audio card.
 */
export interface UsbAudio {
  name: string;
}

const PactlSinkListSchema = z.array(
  z.object({
    name: z.string(),
    active_port: z.union([z.string(), z.null()]).optional(),
  })
);

/** Get current system audio status. */
export async function getAudioInfo(ctx: {
  logger: Logger;
  nodeEnv: typeof NODE_ENV;
}): Promise<AudioInfo> {
  const { logger, nodeEnv } = ctx;
  let errorOutput: string;
  let commandOutput: string;

  try {
    if (nodeEnv === 'production') {
      ({ stderr: errorOutput, stdout: commandOutput } = await execFile('sudo', [
        '/vx/code/app-scripts/pactl.sh',
        '-fjson',
        'list',
        'sinks',
      ]));
    } else {
      ({ stderr: errorOutput, stdout: commandOutput } = await execFile(
        'pactl',
        ['-fjson', 'list', 'sinks']
      ));
    }
  } catch (error) {
    // [TODO] Update log event ID to something more general.
    void logger.logAsCurrentRole(LogEventId.HeadphonesDetectionError, {
      message: `Unable to run pactl command: ${error}}`,
      disposition: 'failure',
    });

    return {};
  }

  if (errorOutput) {
    void logger.logAsCurrentRole(LogEventId.HeadphonesDetectionError, {
      message: `pactl command failed: ${errorOutput}}`,
      disposition: 'failure',
    });

    return {};
  }

  const audioInfo: AudioInfo = {};

  try {
    const audioSinks = PactlSinkListSchema.parse(JSON.parse(commandOutput));

    for (const audioSink of audioSinks) {
      if (audioSink.name.startsWith('alsa_output.pci')) {
        audioInfo.builtin = {
          name: audioSink.name,
          headphonesActive: /headphones/i.test(audioSink.active_port || ''),
        };

        continue;
      }

      if (audioSink.name.startsWith('alsa_output.usb')) {
        audioInfo.usb = {
          name: audioSink.name,
        };
      }
    }
  } catch (error) {
    void logger.logAsCurrentRole(LogEventId.HeadphonesDetectionError, {
      message: `unable to parse pactl output: ${error}}`,
      disposition: 'failure',
    });

    return {};
  }

  return audioInfo;
}
