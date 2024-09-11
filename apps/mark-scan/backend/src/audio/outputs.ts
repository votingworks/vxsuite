/* istanbul ignore file */
import { LogEventId, Logger } from '@votingworks/logging';
import { exec } from '@votingworks/backend';
import { NODE_ENV } from '../globals';

const VX_UI_USERNAME = 'vx-ui';
const CMD_RUN_AS_VX_UI = `sudo -u ${VX_UI_USERNAME} XDG_RUNTIME_DIR=/run/user/$(id -u ${VX_UI_USERNAME})`;

async function runAmixerCommand(
  command: string,
  logger: Logger
): Promise<boolean> {
  let errorOutput: string;

  const prefix = NODE_ENV === 'production' ? CMD_RUN_AS_VX_UI : '';
  const fullCommand = `${prefix} ${command}`;

  try {
    ({ stderr: errorOutput } = await exec(fullCommand));
  } catch (error) {
    void logger.logAsCurrentRole(LogEventId.HeadphonesDetectionError, {
      message: `Unable to run amixer command ${fullCommand}: ${error}}`,
      disposition: 'failure',
    });

    return false;
  }

  if (errorOutput) {
    void logger.logAsCurrentRole(LogEventId.HeadphonesDetectionError, {
      message: `amixer command failed [${fullCommand}]: ${errorOutput}}`,
      disposition: 'failure',
    });

    return false;
  }

  return true;
}

export async function useSpeakerOutput(logger: Logger): Promise<boolean> {
  return runAmixerCommand(
    [
      'amixer set -c0 Headphone 0% mute',
      '&& amixer set -c0 Speaker 100% unmute',
    ].join(' '),
    logger
  );
}

export async function useHeadphoneOutput(logger: Logger): Promise<boolean> {
  return runAmixerCommand(
    [
      'amixer set -c0 Speaker 0% mute',
      '&& amixer set -c0 Headphone 100% unmute',
    ].join(' '),
    logger
  );
}
