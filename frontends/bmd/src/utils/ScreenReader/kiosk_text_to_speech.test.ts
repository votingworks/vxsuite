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
    volume: 50,
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

  expect(tts.isMuted()).toBe(false);
  await tts.speak('hello world');
  expect(window.kiosk.speak).toHaveBeenCalledWith('hello world', {
    volume: 50,
  });
});

it('can be muted, which means no utterances are spoken', async () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  tts.mute();
  expect(tts.isMuted()).toBe(true);
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
    volume: 50,
  });
});

it('can toggle muting', () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  tts.toggleMuted();
  expect(tts.isMuted()).toBe(true);

  tts.toggleMuted();
  expect(tts.isMuted()).toBe(false);
});

it('can set muted by calling toggle with an argument', () => {
  window.kiosk = fakeKiosk();
  const tts = new KioskTextToSpeech();

  tts.toggleMuted(false);
  expect(tts.isMuted()).toBe(false);

  tts.toggleMuted(true);
  expect(tts.isMuted()).toBe(true);
});
