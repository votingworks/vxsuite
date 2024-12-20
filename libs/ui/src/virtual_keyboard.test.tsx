import userEvent from '@testing-library/user-event';

import {
  hasTextAcrossElements,
  mockOf,
  TestLanguageCode,
} from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';

import { act, render, screen, waitFor } from '../test/react_testing_library';
import { US_ENGLISH_KEYMAP, VirtualKeyboard } from './virtual_keyboard';
import { newTestContext as newUiStringsTestContext } from '../test/test_context';
import { AudioOnly } from './ui_strings/audio_only';
import { useCurrentLanguage } from './hooks/use_current_language';

jest.mock(
  './ui_strings/audio_only',
  (): typeof import('./ui_strings/audio_only') => ({
    ...jest.requireActual('./ui_strings/audio_only'),
    AudioOnly: jest.fn(),
  })
);

const { ENGLISH, SPANISH } = TestLanguageCode;

function getMockAudioOnlyTextPrefix(languageCode: string) {
  return `[AudioOnly] [${languageCode}]`;
}

beforeEach(() => {
  mockOf(AudioOnly).mockImplementation((props) => {
    const { children, ...rest } = props;
    const languageCode = useCurrentLanguage();

    return (
      <span {...rest}>
        {getMockAudioOnlyTextPrefix(languageCode)} {children}
      </span>
    );
  });
});

test('fires key events', async () => {
  const { getLanguageContext, render: renderInUiStringsContext } =
    newUiStringsTestContext();

  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  renderInUiStringsContext(
    <VirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={() => false}
    />
  );

  await waitFor(() => expect(getLanguageContext()).toBeDefined());

  const { setLanguage } = assertDefined(getLanguageContext());
  act(() => setLanguage(SPANISH));

  const keysSpokenInVoterLanguage = new Set([',', '.', "'", '"', '-']);

  for (const row of US_ENGLISH_KEYMAP.rows) {
    for (const key of row) {
      const expectedLanguageCode = keysSpokenInVoterLanguage.has(key.value)
        ? SPANISH
        : ENGLISH;

      const expectedButtonContent = `${key.value}${getMockAudioOnlyTextPrefix(
        expectedLanguageCode
      )} ${key.value}`;

      // Using `getByText` here instead of `getButton`, since the latter is
      // significantly slower, especially with this many iterations.
      // The "custom keymap" test below verifies that the keys are rendered as
      // accessible buttons.
      userEvent.click(
        screen.getByText(hasTextAcrossElements(expectedButtonContent))
      );
      expect(onKeyPress).lastCalledWith(key.value);
    }
  }

  const spaceBar = screen.getButton(
    `space ${getMockAudioOnlyTextPrefix(SPANISH)} space`
  );
  userEvent.click(spaceBar);
  expect(onKeyPress).lastCalledWith(' ');

  expect(onBackspace).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('delete'));
  expect(onBackspace).toHaveBeenCalled();
});

test("doesn't fire key events for disabled keys", () => {
  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  render(
    <VirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={(k) => k === 'M'}
    />
  );

  userEvent.click(screen.getButton(/\bM\b/));
  expect(onKeyPress).not.toHaveBeenCalled();
});

test('custom keymap', () => {
  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  render(
    <VirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={(k) => k === 'M'}
      keyMap={{
        rows: [
          [
            { value: '😂', renderAudioString: () => 'lol' },
            {
              value: '✨',
              renderAudioString: () => 'magic',
              renderLabel: () => 'magic',
            },
          ],
        ],
      }}
    />
  );

  userEvent.click(
    screen.getButton(`😂 ${getMockAudioOnlyTextPrefix(ENGLISH)} lol`)
  );
  expect(onKeyPress).lastCalledWith('😂');

  userEvent.click(
    screen.getButton(`magic ${getMockAudioOnlyTextPrefix(ENGLISH)} magic`)
  );
  expect(onKeyPress).lastCalledWith('✨');
});
