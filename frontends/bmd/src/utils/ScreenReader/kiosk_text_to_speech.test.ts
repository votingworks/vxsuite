import { waitFor } from '@testing-library/react';
import { fakeKiosk } from '@votingworks/test-utils';
import { KioskTextToSpeech } from './kiosk_text_to_speech';

beforeEach(() => {
  window.kiosk = undefined;
});

it('speaks an utterance when given text to speak', async () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  await tts.speak('hello world');
  expect(window.kiosk.cancelSpeak).toHaveBeenCalled();
  expect(window.kiosk.speak).toHaveBeenCalledWith('hello world', {
    volume: 44,
  });
});

it('delegates `stop` to `KioskBrowser#cancelSpeak`', () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  expect(window.kiosk.cancelSpeak).not.toHaveBeenCalled();
  tts.stop();
  expect(window.kiosk.cancelSpeak).toHaveBeenCalled();
});

it('is unmuted by default, which means utterances are spoken', async () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  expect(tts.isMuted()).toEqual(false);
  await tts.speak('hello world');
  expect(window.kiosk.speak).toHaveBeenCalledWith('hello world', {
    volume: 44,
  });
});

it('can be muted, which means no utterances are spoken', async () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  tts.mute();
  expect(tts.isMuted()).toEqual(true);
  await tts.speak('hello world');
  expect(window.kiosk.speak).not.toHaveBeenCalled();
});

it('can be muted and then unmuted, which means utterances are spoken', async () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  tts.mute();
  tts.unmute();
  await tts.speak('hello world');
  expect(window.kiosk.speak).toHaveBeenCalledWith('hello world', {
    volume: 44,
  });
});

it('can toggle muting', () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  tts.toggleMuted();
  expect(tts.isMuted()).toEqual(true);

  tts.toggleMuted();
  expect(tts.isMuted()).toEqual(false);
});

it('can set muted by calling toggle with an argument', () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  tts.toggleMuted(false);
  expect(tts.isMuted()).toEqual(false);

  tts.toggleMuted(true);
  expect(tts.isMuted()).toEqual(true);
});

it('changeVolume cycles through volumes and announces the change', async () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  // check initial volume
  await tts.speak('hello world');
  expect(window.kiosk.speak).toHaveBeenCalledWith('hello world', {
    volume: 44,
  });

  // check increasing volume
  for (let i = 4; i <= 10; i += 1) {
    tts.changeVolume();
    await waitFor(() => {
      expect(window.kiosk!.speak).toHaveBeenLastCalledWith(
        `Increased volume to ${i} out of 10.`,
        {
          volume: 20 + i * 8,
        }
      );
    });
  }

  // check that changed volume applies to other requests
  await tts.speak('hello world');
  expect(window.kiosk.speak).toHaveBeenLastCalledWith('hello world', {
    volume: 100,
  });

  // check decreasing volume
  for (let i = 9; i >= 1; i -= 1) {
    tts.changeVolume();
    await waitFor(() => {
      expect(window.kiosk!.speak).toHaveBeenLastCalledWith(
        `Decreased volume to ${i} out of 10.`,
        {
          volume: 20 + i * 8,
        }
      );
    });
  }

  // check return to initial volume
  for (let i = 2; i <= 3; i += 1) {
    tts.changeVolume();
    await waitFor(() => {
      expect(window.kiosk!.speak).toHaveBeenLastCalledWith(
        `Increased volume to ${i} out of 10.`,
        {
          volume: 20 + i * 8,
        }
      );
    });
  }
});
