import { text, element as h } from '../../../test/helpers/dom_builders';
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

it('speaks text nodes by reading their content', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakNode(text('hello'));
  expect(tts.speak).toHaveBeenCalledWith('hello', expect.anything());
});

it('does not speak empty text nodes', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);
  const node = text('');

  // Can't do `node.textContent = null` because it gets coerced to "null".
  Object.defineProperty(node, 'textContent', {
    value: null,
  });

  await asr.speakNode(node);
  expect(tts.speak).not.toHaveBeenCalled();
});

it('speaks inline elements by joining their children together', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakNode(
    h(
      'span',
      text('Welcome '),
      h('strong', text('Bob')),
      text(', to your dashboard!')
    )
  );
  expect(tts.speak).toHaveBeenCalledWith(
    'Welcome Bob, to your dashboard!',
    expect.anything()
  );
});

it('describes text broken into multiple text nodes correctly', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakNode(
    h(
      'span',
      text('You may only select '),
      text('1'),
      text(' '),
      text('candidate'),
      text(' in this contest. To vote for'),
      text(' '),
      text('Adam Cramer and Greg Vuocolo'),
      text(', you must first unselect the selected'),
      text(' '),
      text('candidate'),
      text('.'),
      h('span', text('Use the select button to continue.'))
    )
  );
  expect(tts.speak).toHaveBeenCalledWith(
    'You may only select 1 candidate in this contest. To vote for Adam Cramer and Greg Vuocolo, you must first unselect the selected candidate. Use the select button to continue.',
    expect.anything()
  );
});

it('terminates block elements with a period', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakNode(h('div', text('General Election')));
  expect(tts.speak).toHaveBeenCalledWith(
    'General Election.',
    expect.anything()
  );
});

it('does not speak nodes with empty descriptions', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakNode(text(''));
  expect(tts.speak).not.toHaveBeenCalled();
});

it('speaks aria-label instead of text content if present', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakNode(
    h('span', { 'aria-label': 'Read this instead' }, text('Do not read this'))
  );
  expect(tts.speak).toHaveBeenCalledWith(
    'Read this instead',
    expect.anything()
  );
});

it('speaks a description of an aria-labeledby element if present', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);
  const field = h(
    'span',
    h('label', { id: 'name-label' }, text('Name')),
    h('input', { type: 'text', 'aria-labeledby': 'name-label' })
  );

  document.body.append(field);

  try {
    await asr.speakNode(field.querySelector('input')!);
    expect(tts.speak).toHaveBeenCalledWith('Name', expect.anything());
  } finally {
    document.body.removeChild(field);
  }
});

it('ignores an aria-labeledby attribute if the element exists but has no description', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);
  const field = h(
    'span',
    h('label', { id: 'name-label' }, text('')),
    h('input', { type: 'text', 'aria-labeledby': 'name-label' })
  );

  document.body.append(field);

  try {
    await asr.speakNode(field.querySelector('input')!);
    expect(tts.speak).not.toHaveBeenCalled();
  } finally {
    document.body.removeChild(field);
  }
});

it('ignores an aria-labeledby attribute if no such element exists', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakNode(
    h(
      'span',
      { 'aria-labeledby': 'name-label' },
      text('Read this since name-label does not exist')
    )
  );
  expect(tts.speak).toHaveBeenCalledWith(
    'Read this since name-label does not exist',
    expect.anything()
  );
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

it('does not describe elements hidden by aria-hidden', () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  expect(
    asr.describe(
      h('span', { 'aria-hidden': 'true' }, text('Nothing to see here'))
    )
  ).toEqual(undefined);
});

it('does not describe elements hidden by display:none', () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  expect(
    asr.describe(
      h('span', { style: 'display: none' }, text('Nothing to see here'))
    )
  ).toEqual(undefined);
});

it('does not describe elements hidden by visibility:hidden', () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  expect(
    asr.describe(
      h('span', { style: 'visibility: hidden' }, text('Nothing to see here'))
    )
  ).toEqual(undefined);
});

it('does not describe document fragments', () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  expect(asr.describe(document.createDocumentFragment())).toEqual(undefined);
});

it('describes event targets if present', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakEventTarget(h('button', text('Next')));
  expect(tts.speak).toHaveBeenCalledWith('Next', expect.anything());
});

it('speaks event targets immediately rather than queueing speech', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakEventTarget(h('button', text('Next')));
  expect(tts.speak).toHaveBeenCalledWith(expect.anything(), { now: true });
});

it('does nothing if there is no event target', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.speakEventTarget(undefined);
  expect(tts.speak).not.toHaveBeenCalled();
});

it('speaks focus event targets immediately', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.onFocus(h('button', text('Next')));
  expect(tts.speak).toHaveBeenCalledWith('Next', { now: true });
});

it('speaks click event targets immediately', async () => {
  const tts = fakeTts();
  const asr = new AriaScreenReader(tts);

  await asr.onClick(h('button', text('Next')));
  expect(tts.speak).toHaveBeenCalledWith('Next', { now: true });
});
