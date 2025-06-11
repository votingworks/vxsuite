import { expect, test, vi } from 'vitest';

import { LogEventId, mockLogger } from '@votingworks/logging';
import { execFile } from '../exec';
import { AudioInfo, getAudioInfo } from './get_audio_info';

vi.mock(import('../exec.js'));

const mockExecFile = vi.mocked(execFile);

test('NODE_ENV=production - runs app script via sudo', async () => {
  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: JSON.stringify([
      {
        name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
        active_port: 'analog-output-headphones',
      },
    ]),
  });

  await getAudioInfo({
    logger: mockLogger({ fn: vi.fn }),
    nodeEnv: 'production',
  });

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('sudo', [
    '/vx/code/app-scripts/pactl.sh',
    '-fjson',
    'list',
    'sinks',
  ]);
});

test('NODE_ENV=development - runs pactl directly', async () => {
  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: JSON.stringify([
      {
        name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
        active_port: 'analog-output-headphones',
      },
    ]),
  });

  await getAudioInfo({
    logger: mockLogger({ fn: vi.fn }),
    nodeEnv: 'development',
  });

  expect(mockExecFile).toHaveBeenCalledExactlyOnceWith('pactl', [
    '-fjson',
    'list',
    'sinks',
  ]);
});

test('command successful - headphones active', async () => {
  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: JSON.stringify([
      {
        index: 52,
        state: 'SUSPENDED',
        name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
        driver: 'PipeWire',
        // ...
        ports: [
          {
            name: 'analog-output-speaker',
            description: 'Speaker',
            type: 'Speaker',
            priority: 10000,
            availability_group: '',
            availability: 'availability unknown',
          },
          {
            name: 'analog-output-headphones',
            description: 'Headphones',
            type: 'Headphones',
            priority: 20000,
            availability_group: 'Headphone',
            availability: 'available',
          },
        ],
        active_port: 'analog-output-headphones',
        formats: ['pcm'],
      },
    ]),
  });

  const logger = mockLogger({ fn: vi.fn });
  const nodeEnv = 'production';
  expect(await getAudioInfo({ logger, nodeEnv })).toEqual<AudioInfo>({
    builtin: {
      headphonesActive: true,
      name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
    },
  });

  expect(logger.log).not.toHaveBeenCalled();
});

test('command successful - speakers active', async () => {
  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: JSON.stringify([
      {
        index: 52,
        state: 'SUSPENDED',
        name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
        driver: 'PipeWire',
        // ...
        ports: [
          {
            name: 'analog-output-speaker',
            description: 'Speaker',
            type: 'Speaker',
            priority: 10000,
            availability_group: '',
            availability: 'availability unknown',
          },
          {
            name: 'analog-output-headphones',
            description: 'Headphones',
            type: 'Headphones',
            priority: 20000,
            availability_group: 'Headphone',
            availability: 'not available',
          },
        ],
        active_port: 'analog-output-speaker',
        formats: ['pcm'],
      },

      {
        index: 482,
        state: 'SUSPENDED',
        name: 'alsa_output.hdmi.stereo',
        description: 'HDMI Audio',
        driver: 'PipeWire',
        // ...
        ports: [
          {
            name: '[Out] HDMI1',
            description: 'HDMI/DisplayPort 1 Output',
            type: 'HDMI',
            priority: 9900,
            availability_group: 'HDMI/DP,pcm=4',
            availability: 'not available',
          },
        ],
        active_port: 'HDMI1',
        formats: ['pcm'],
      },
    ]),
  });

  const logger = mockLogger({ fn: vi.fn });
  const nodeEnv = 'production';
  expect(await getAudioInfo({ logger, nodeEnv })).toEqual<AudioInfo>({
    builtin: {
      headphonesActive: false,
      name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
    },
  });

  expect(logger.logAsCurrentRole).not.toHaveBeenCalled();
});

test('command successful - USB audio connected', async () => {
  mockExecFile.mockResolvedValue({
    stderr: '',
    stdout: JSON.stringify([
      {
        index: 52,
        state: 'SUSPENDED',
        name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
        driver: 'PipeWire',
        // ...
        ports: [
          {
            name: 'analog-output-speaker',
            description: 'Speaker',
            type: 'Speaker',
            priority: 10000,
            availability_group: '',
            availability: 'availability unknown',
          },
          {
            name: 'analog-output-headphones',
            description: 'Headphones',
            type: 'Headphones',
            priority: 20000,
            availability_group: 'Headphone',
            availability: 'not available',
          },
        ],
        active_port: null,
        formats: ['pcm'],
      },

      {
        index: 482,
        state: 'SUSPENDED',
        name: 'alsa_output.usb-Generic_USB_Audio-00.analog-stereo',
        description: 'USB Audio Analog Stereo',
        driver: 'PipeWire',
        // ...
        ports: [
          {
            name: 'analog-output-speaker',
            description: 'Speaker',
            type: 'Speaker',
            priority: 9900,
            availability_group: 'Legacy 2',
            availability: 'available',
          },
        ],
        active_port: 'analog-output-speaker',
        formats: ['pcm'],
      },
    ]),
  });

  const logger = mockLogger({ fn: vi.fn });
  const nodeEnv = 'production';
  expect(await getAudioInfo({ logger, nodeEnv })).toEqual<AudioInfo>({
    builtin: {
      headphonesActive: false,
      name: 'alsa_output.pci-0000_00_01.0.analog-stereo',
    },
    usb: {
      name: 'alsa_output.usb-Generic_USB_Audio-00.analog-stereo',
    },
  });

  expect(logger.logAsCurrentRole).not.toHaveBeenCalled();
});

test('execFile error', async () => {
  mockExecFile.mockRejectedValue('execFile failed');

  const logger = mockLogger({ fn: vi.fn });
  const nodeEnv = 'production';
  expect(await getAudioInfo({ logger, nodeEnv })).toEqual<AudioInfo>({});

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioDeviceDetectionError,
    {
      message: expect.stringContaining('execFile failed'),
      disposition: 'failure',
    }
  );
});

test('pactl error', async () => {
  mockExecFile.mockResolvedValue({ stderr: 'access denied', stdout: '' });

  const logger = mockLogger({ fn: vi.fn });
  const nodeEnv = 'production';
  expect(await getAudioInfo({ logger, nodeEnv })).toEqual<AudioInfo>({});

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioDeviceDetectionError,
    {
      message: expect.stringContaining('access denied'),
      disposition: 'failure',
    }
  );
});

test('pactl output parse error', async () => {
  mockExecFile.mockResolvedValue({ stderr: '', stdout: '[{"not":"valid"}]' });

  const logger = mockLogger({ fn: vi.fn });
  const nodeEnv = 'production';
  expect(await getAudioInfo({ logger, nodeEnv })).toEqual<AudioInfo>({});

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AudioDeviceDetectionError,
    {
      message: expect.stringContaining('ZodError'),
      disposition: 'failure',
    }
  );
});
