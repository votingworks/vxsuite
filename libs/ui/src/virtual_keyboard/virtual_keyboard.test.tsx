import { beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import {
  hasTextAcrossElements,
  TestLanguageCode,
} from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';

import { act, render, screen, waitFor } from '../../test/react_testing_library';
import { US_ENGLISH_KEYMAP, VirtualKeyboard } from './virtual_keyboard';
import { newTestContext as newUiStringsTestContext } from '../../test/test_context';
import { AudioOnly } from '../ui_strings/audio_only';
import { useCurrentLanguage } from '../hooks/use_current_language';
import { appStrings } from '../ui_strings';

vi.mock(import('../ui_strings/audio_only.js'), async (importActual) => ({
  ...(await importActual()),
  AudioOnly: vi.fn(),
}));

const { ENGLISH, SPANISH } = TestLanguageCode;

function getMockAudioOnlyTextPrefix(languageCode: string) {
  return `[AudioOnly] [${languageCode}]`;
}

beforeEach(() => {
  vi.mocked(AudioOnly).mockImplementation((props) => {
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

  const onKeyPress = vi.fn();
  const onBackspace = vi.fn();

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
  const onKeyPress = vi.fn();
  const onBackspace = vi.fn();

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
  const onKeyPress = vi.fn();
  const onBackspace = vi.fn();

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

const TEST_ROWS = [
  ...US_ENGLISH_KEYMAP.rows,
  [
    {
      value: 'space',
      renderAudioString: () => appStrings.labelKeyboardSpaceBar(),
      audioLanguageOverride: 'en',
    },
    {
      value: 'delete',
      renderAudioString: () => appStrings.labelKeyboardDelete(),
      audioLanguageOverride: 'en',
    },
  ],
];

async function pressKeyAndExpectFocus(
  keyToPress: string,
  expectedFocusedKey: string
) {
  userEvent.keyboard(keyToPress);

  if (expectedFocusedKey === 'delete') {
    const expectedButtonContent = 'delete';
    const expectedContentElement = await screen.findByText(
      hasTextAcrossElements(expectedButtonContent)
    );
    const expectedFocus = expectedContentElement.parentNode?.parentNode;
    expect(expectedFocus).toHaveFocus();
  } else {
    const expectedButtonContent = `${expectedFocusedKey}${getMockAudioOnlyTextPrefix(
      ENGLISH
    )} ${expectedFocusedKey}`;

    // Finds the lowest element with the target text contained across its children. For the VirtualKeyboard
    // this is a <span>
    const expectedContentElement = await screen.findByText(
      hasTextAcrossElements(expectedButtonContent)
    );
    // The button with focus is the parent of the above <span> element
    const expectedFocus = expectedContentElement.parentNode;
    expect(expectedFocus).toHaveFocus();
  }
}

test('navigation with left and right arrow', async () => {
  const { render: renderInUiStringsContext } = newUiStringsTestContext();

  const onKeyPress = vi.fn();
  const onBackspace = vi.fn();

  renderInUiStringsContext(
    <VirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={() => false}
      enableWriteInAtiControllerNavigation
    />
  );

  // Wait for first render
  const expectedButtonContent = `Q${getMockAudioOnlyTextPrefix(ENGLISH)} Q`;
  await screen.findByText(hasTextAcrossElements(expectedButtonContent));

  for (const row of TEST_ROWS) {
    for (const key of row) {
      await pressKeyAndExpectFocus('[ArrowRight]', key.value);
    }
  }

  // Expect wrap around from end of keyboard
  await pressKeyAndExpectFocus('[ArrowRight]', TEST_ROWS[0][0].value);

  const reversed = TEST_ROWS.toReversed();
  for (const row of reversed) {
    const reversedKeys = row.toReversed();
    for (const key of reversedKeys) {
      await pressKeyAndExpectFocus('[ArrowLeft]', key.value);
    }
  }
});

test('navigation with up and down arrow', async () => {
  const { render: renderInUiStringsContext } = newUiStringsTestContext();

  const onKeyPress = vi.fn();
  const onBackspace = vi.fn();

  renderInUiStringsContext(
    <VirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={() => false}
      enableWriteInAtiControllerNavigation
    />
  );

  // Wait for first render
  const expectedButtonContent = `Q${getMockAudioOnlyTextPrefix(ENGLISH)} Q`;
  await screen.findByText(hasTextAcrossElements(expectedButtonContent));

  // Go down and wrap around to start
  await pressKeyAndExpectFocus('[ArrowDown]', 'A');
  await pressKeyAndExpectFocus('[ArrowDown]', 'Z');
  await pressKeyAndExpectFocus('[ArrowDown]', 'space');
  await pressKeyAndExpectFocus('[ArrowDown]', 'Q');
  // Go up and wrap around to start
  await pressKeyAndExpectFocus('[ArrowUp]', 'space');
  await pressKeyAndExpectFocus('[ArrowUp]', 'Z');
  await pressKeyAndExpectFocus('[ArrowUp]', 'A');
  await pressKeyAndExpectFocus('[ArrowUp]', 'Q');

  // Go to right half of keyboard and check we don't
  // reset to the left side of keyboard when moving up and down
  await pressKeyAndExpectFocus('[ArrowDown]', 'A');
  await pressKeyAndExpectFocus('[ArrowRight]', 'S');
  await pressKeyAndExpectFocus('[ArrowRight]', 'D');
  await pressKeyAndExpectFocus('[ArrowRight]', 'F');
  await pressKeyAndExpectFocus('[ArrowRight]', 'G');
  await pressKeyAndExpectFocus('[ArrowRight]', 'H');
  await pressKeyAndExpectFocus('[ArrowRight]', 'J');

  // Now on the right side of the keyboard; go up and wrap around to start
  await pressKeyAndExpectFocus('[ArrowDown]', 'N');
  await pressKeyAndExpectFocus('[ArrowDown]', 'delete');
  await pressKeyAndExpectFocus('[ArrowDown]', 'Y');
  await pressKeyAndExpectFocus('[ArrowDown]', 'J');

  // Go down and wrap around to start
  await pressKeyAndExpectFocus('[ArrowUp]', 'Y');
  await pressKeyAndExpectFocus('[ArrowUp]', 'delete');
  await pressKeyAndExpectFocus('[ArrowUp]', 'N');
  await pressKeyAndExpectFocus('[ArrowUp]', 'J');
});
