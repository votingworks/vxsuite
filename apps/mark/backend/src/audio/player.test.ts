import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockLogger } from '@votingworks/logging';
import {
  analogAndHdmi,
  DEFAULT_HEADPHONE_VOLUME_PCT,
  getAudioInfoWithRetry,
  getNodeEnv,
  setAudioVolume,
  setDefaultAudio,
  usbAndHdmi,
} from '@votingworks/backend';
import { err, ok } from '@votingworks/basics';
import { expectToHaveBeenCalledWith } from '@votingworks/test-utils/expect';
import { type AudioCard, newAudioPlayer, type SoundName } from './player.js';

vi.mock('@votingworks/backend', async (importActual) => ({
  ...(await importActual()),
  getAudioInfoWithRetry: vi.fn(),
  setAudioVolume: vi.fn(),
  setDefaultAudio: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('newAudioPlayer correctly detects and configures hardware', () => {
  test('analog/HDMI audio', async () => {
    vi.mocked(getAudioInfoWithRetry).mockResolvedValue({
      builtin: { headphonesActive: true, name: 'alsa-pci' },
    });

    const mockCard = { mock: 'card' } as unknown as AudioCard;
    vi.spyOn(analogAndHdmi, 'defaultAudioCard').mockResolvedValue(mockCard);

    const mockPlayer: analogAndHdmi.PlayerInterface<SoundName> = {
      play: () => Promise.reject(new Error('unexpected call')),
      setHeadphoneVolume: () => Promise.reject(new Error('unexpected call')),
      setIsScreenReaderEnabled: () =>
        Promise.reject(new Error('unexpected call')),
    };

    const mockPlayerInit = vi
      .spyOn(analogAndHdmi, 'defaultAudioPlayer')
      .mockReturnValue(mockPlayer);

    const logger = mockLogger({ fn: vi.fn });
    expect(await newAudioPlayer({ logger })).toEqual(mockPlayer);

    expectToHaveBeenCalledWith(mockPlayerInit, {
      card: mockCard,
      nodeEnv: getNodeEnv(),
      logger,
      soundsDirectory: import.meta.dirname,
    });
  });

  test('USB/HDMI audio', async () => {
    vi.mocked(getAudioInfoWithRetry).mockResolvedValue({
      builtin: { headphonesActive: false, name: 'alsa-pci' },
      usb: { name: 'alsa-usb' },
    });

    const mockPlayer: usbAndHdmi.PlayerInterface<SoundName> = {
      play: () => Promise.reject(new Error('unexpected call')),
    };

    const mockPlayerInit = vi
      .spyOn(usbAndHdmi, 'defaultAudioPlayer')
      .mockResolvedValueOnce(mockPlayer);

    vi.mocked(setDefaultAudio).mockResolvedValue(ok());
    vi.mocked(setAudioVolume).mockResolvedValue(ok());

    const logger = mockLogger({ fn: vi.fn });
    await newAudioPlayer({ logger });

    expectToHaveBeenCalledWith(mockPlayerInit, {
      device: { headphonesActive: false, name: 'alsa-pci' },
      nodeEnv: getNodeEnv(),
      logger,
      soundsDirectory: import.meta.dirname,
    });

    expectToHaveBeenCalledWith(vi.mocked(setDefaultAudio), 'alsa-usb', {
      logger,
      nodeEnv: getNodeEnv(),
    });

    expectToHaveBeenCalledWith(vi.mocked(setAudioVolume), {
      logger,
      nodeEnv: getNodeEnv(),
      sinkName: 'alsa-usb',
      volumePct: DEFAULT_HEADPHONE_VOLUME_PCT,
    });
  });
});

describe('newAudioPlayer allows initial headphone volume override', () => {
  test('analog/HDMI audio', async () => {
    vi.mocked(getAudioInfoWithRetry).mockResolvedValue({
      builtin: { headphonesActive: true, name: 'alsa-pci' },
    });

    const mockCard = { mock: 'card' } as unknown as AudioCard;
    vi.spyOn(analogAndHdmi, 'defaultAudioCard').mockResolvedValue(mockCard);

    const mockPlayer: analogAndHdmi.PlayerInterface<SoundName> = {
      setHeadphoneVolume: vi.fn(() => Promise.resolve()),

      play: () => Promise.reject(new Error('unexpected call')),
      setIsScreenReaderEnabled: () =>
        Promise.reject(new Error('unexpected call')),
    };

    vi.spyOn(analogAndHdmi, 'defaultAudioPlayer').mockReturnValue(mockPlayer);

    const logger = mockLogger({ fn: vi.fn });
    expect(await newAudioPlayer({ headphoneVolumePct: 40, logger })).toEqual(
      mockPlayer
    );
    expectToHaveBeenCalledWith(vi.mocked(mockPlayer.setHeadphoneVolume), 40);
  });

  test('USB/HDMI audio', async () => {
    vi.mocked(getAudioInfoWithRetry).mockResolvedValue({
      builtin: { headphonesActive: false, name: 'alsa-pci' },
      usb: { name: 'alsa-usb' },
    });

    vi.spyOn(usbAndHdmi, 'defaultAudioPlayer').mockResolvedValueOnce({
      play: () => Promise.reject(new Error('unexpected call')),
    });

    vi.mocked(setDefaultAudio).mockResolvedValue(ok());
    vi.mocked(setAudioVolume).mockResolvedValue(ok());

    const logger = mockLogger({ fn: vi.fn });
    await newAudioPlayer({ headphoneVolumePct: 40, logger });

    expectToHaveBeenCalledWith(vi.mocked(setAudioVolume), {
      logger,
      nodeEnv: getNodeEnv(),
      sinkName: 'alsa-usb',
      volumePct: 40,
    });
  });
});

test('analog/HDMI audio - throws if unable to initialize card', async () => {
  vi.mocked(getAudioInfoWithRetry).mockResolvedValue({
    builtin: { headphonesActive: true, name: 'alsa-pci' },
  });

  vi.spyOn(analogAndHdmi, 'defaultAudioCard').mockRejectedValue(
    new Error('no card')
  );

  const logger = mockLogger({ fn: vi.fn });
  await expect(newAudioPlayer({ logger })).rejects.toThrow('no card');
});

test('USB/HDMI audio - throws is unable to set USB as default output', async () => {
  vi.mocked(getAudioInfoWithRetry).mockResolvedValue({
    builtin: { headphonesActive: false, name: 'alsa-pci' },
    usb: { name: 'alsa-usb' },
  });

  vi.spyOn(usbAndHdmi, 'defaultAudioPlayer').mockResolvedValueOnce({
    play: () => Promise.reject(new Error('unexpected call')),
  });

  vi.mocked(setDefaultAudio).mockResolvedValue(
    err({ code: 'pactlError', error: 'invalid sink name' })
  );

  const logger = mockLogger({ fn: vi.fn });
  await expect(newAudioPlayer({ logger })).rejects.toThrow(
    'unable to set USB audio as default output'
  );
});

test('USB/HDMI audio - throws is unable to set USB headphone volume', async () => {
  vi.mocked(getAudioInfoWithRetry).mockResolvedValue({
    builtin: { headphonesActive: false, name: 'alsa-pci' },
    usb: { name: 'alsa-usb' },
  });

  vi.spyOn(usbAndHdmi, 'defaultAudioPlayer').mockResolvedValueOnce({
    play: () => Promise.reject(new Error('unexpected call')),
  });

  vi.mocked(setDefaultAudio).mockResolvedValue(ok());
  vi.mocked(setAudioVolume).mockResolvedValue(
    err({ code: 'pactlError', error: 'invalid sink name' })
  );

  const logger = mockLogger({ fn: vi.fn });
  await expect(newAudioPlayer({ logger })).rejects.toThrow(
    'unable to set USB audio volume'
  );
});
