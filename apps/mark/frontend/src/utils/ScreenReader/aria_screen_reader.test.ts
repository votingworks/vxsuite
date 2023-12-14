import { fakeTts } from '../../../test/helpers/fake_tts';
import { AriaScreenReader } from './aria_screen_reader';

it('requires a text-to-speech engine', () => {
  expect(() => new AriaScreenReader(fakeTts())).not.toThrowError();
});

it('can speak specified text', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speak('Hello world.');
  expect(tts.speak).toHaveBeenCalledWith('Hello world.', {});
});

it('passes options through from #speak', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speak('Hello world.', { now: true });
  expect(tts.speak).toHaveBeenCalledWith('Hello world.', { now: true });
});

it('enabling the screen reader unmutes and then announces it', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.enable();
  expect(tts.speak).toHaveBeenCalledWith(
    'Screen reader enabled',
    expect.anything()
  );
  expect(tts.unmute).toHaveBeenCalledTimes(1);

  expect(tts.unmute.mock.invocationCallOrder[0]).toBeLessThan(
    tts.speak.mock.invocationCallOrder[0]
  );
});

it('disabling the screen reader announces it and then mutes the tts', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.disable();
  expect(tts.speak).toHaveBeenCalledWith(
    'Screen reader disabled',
    expect.anything()
  );
  expect(tts.mute).toHaveBeenCalledTimes(1);

  expect(tts.speak.mock.invocationCallOrder[0]).toBeLessThan(
    tts.mute.mock.invocationCallOrder[0]
  );
});

it('toggling enabled/disabled mutes or unmutes the tts', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  expect(tts.isMuted()).toEqual(true);

  await asr.toggle();
  expect(tts.isMuted()).toEqual(false);

  await asr.toggle();
  expect(tts.isMuted()).toEqual(true);

  await asr.toggle();
  expect(tts.isMuted()).toEqual(false);
});

it('toggle can explicitly set enabled/disabled', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.toggle(false);
  expect(tts.isMuted()).toEqual(true);

  await asr.toggle(true);
  expect(tts.isMuted()).toEqual(false);

  await asr.toggle(false);
  expect(tts.isMuted()).toEqual(true);
});
