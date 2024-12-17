import { mockOf } from '@votingworks/test-utils';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { execFile } from '../exec';
import { AudioInfo, getAudioInfo } from './get_audio_info';

jest.mock('../exec');

const mockExecFile = mockOf(execFile);

test('command successful - headphones active', async () => {
  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: `
      Sink #972
        Name: alsa_output.pci-0000_00_01.0.analog-stereo
        Description: Built-in Audio Analog Stereo
        Properties:
          alsa.card = "0"
          alsa.card_name = "HDA Intel"
        Ports:
          analog-output-speaker: Speakers (type: Speaker, priority: 10000, availability group: Legacy 2, available)
          analog-output-headphones: Headphones (type: Headphones, priority: 9900, availability group: Legacy 2, available)
        Active Port: analog-output-headphones
        Formats:
          pcm
    `,
  });

  const logger = mockLogger({ fn: jest.fn });
  expect(await getAudioInfo(logger)).toEqual<AudioInfo>({
    headphonesActive: true,
  });

  expect(logger.log).not.toHaveBeenCalled();
});

test('command successful - speakers active', async () => {
  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: `
      Sink #972
        Name: alsa_output.pci-0000_00_01.0.analog-stereo
        Description: Built-in Audio Analog Stereo
        Properties:
          alsa.card = "0"
          alsa.card_name = "HDA Intel"
        Ports:
          analog-output-speaker: Speakers (type: Speaker, priority: 10000, availability group: Legacy 2, available)
          analog-output-headphones: Headphones (type: Headphones, priority: 9900, availability group: Legacy 2, available)
        Active Port: analog-output-speaker
        Formats:
          pcm
    `,
  });

  const logger = mockLogger({ fn: jest.fn });
  expect(await getAudioInfo(logger)).toEqual<AudioInfo>({
    headphonesActive: false,
  });

  expect(logger.logAsCurrentRole).not.toHaveBeenCalled();
});

test('execFile error', async () => {
  mockExecFile.mockRejectedValue('execFile failed');

  const logger = mockLogger({ fn: jest.fn });
  expect(await getAudioInfo(logger)).toEqual<AudioInfo>({
    headphonesActive: false,
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.HeadphonesDetectionError,
    {
      message: expect.stringContaining('execFile failed'),
      disposition: 'failure',
    }
  );
});

test('pactl error', async () => {
  mockExecFile.mockResolvedValue({ stderr: 'access denied', stdout: '' });

  const logger = mockLogger({ fn: jest.fn });
  expect(await getAudioInfo(logger)).toEqual<AudioInfo>({
    headphonesActive: false,
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.HeadphonesDetectionError,
    {
      message: expect.stringContaining('access denied'),
      disposition: 'failure',
    }
  );
});
