import fakeVoice from '../../../test/helpers/fakeVoice';
import SpeechSynthesisTextToSpeech from './SpeechSynthesisTextToSpeech';

it('speaks an utterance when given text to speak', async () => {
  const tts = new SpeechSynthesisTextToSpeech();

  await tts.speak('hello queued');
  expect(speechSynthesis.cancel).not.toHaveBeenCalled();
  expect(speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'hello queued' })
  );
});

it('cancels speech before speaking an utterance if `now` is true', async () => {
  const tts = new SpeechSynthesisTextToSpeech();

  await tts.speak('hello right now!', { now: true });
  expect(speechSynthesis.cancel).toHaveBeenCalled();
  expect(speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'hello right now!' })
  );
});

it('delegates `stop` to `SpeechSynthesis#cancel`', () => {
  const tts = new SpeechSynthesisTextToSpeech();

  expect(speechSynthesis.cancel).not.toHaveBeenCalled();
  tts.stop();
  expect(speechSynthesis.cancel).toHaveBeenCalledTimes(1);
});

it('accepts a voice getter', async () => {
  const voice = fakeVoice({ name: 'Alex' });
  const tts = new SpeechSynthesisTextToSpeech(() => voice);

  await tts.speak('hello');

  expect(speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ voice })
  );
});

it('is unmuted by default, which means utterances are spoken', async () => {
  const tts = new SpeechSynthesisTextToSpeech();

  expect(tts.isMuted()).toBe(false);
  await tts.speak('hello');
  expect(speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'hello' })
  );
});

it('can be muted, which means no utterances are spoken', async () => {
  const tts = new SpeechSynthesisTextToSpeech();

  tts.mute();
  expect(tts.isMuted()).toBe(true);
  await tts.speak('hello');
  expect(speechSynthesis.speak).not.toHaveBeenCalled();
});

it('can be muted and then unmuted, which means utterances are spoken', async () => {
  const tts = new SpeechSynthesisTextToSpeech();

  tts.mute();
  tts.unmute();
  await tts.speak('hello');
  expect(speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'hello' })
  );
});

it('can toggle muting', () => {
  const tts = new SpeechSynthesisTextToSpeech();

  tts.toggleMuted();
  expect(tts.isMuted()).toBe(true);

  tts.toggleMuted();
  expect(tts.isMuted()).toBe(false);
});

it('can set muted by calling toggle with an argument', () => {
  const tts = new SpeechSynthesisTextToSpeech();

  tts.toggleMuted(false);
  expect(tts.isMuted()).toBe(false);

  tts.toggleMuted(true);
  expect(tts.isMuted()).toBe(true);
});
