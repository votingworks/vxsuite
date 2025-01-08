import userEvent from '@testing-library/user-event';

import {
  hasTextAcrossElements,
  mockOf,
  TestLanguageCode,
} from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';

import { act, render, screen, waitFor } from '../../test/react_testing_library';
import { newTestContext as newUiStringsTestContext } from '../../test/test_context';
import { AudioOnly } from '../ui_strings/audio_only';
import { useCurrentLanguage } from '../hooks/use_current_language';
import {
  ScanPanelVirtualKeyboard,
  US_ENGLISH_SCAN_PANEL_KEYMAP,
} from './scan_panel_virtual_keyboard';

jest.mock(
  '../ui_strings/audio_only',
  (): typeof import('../ui_strings/audio_only') => ({
    ...jest.requireActual('../ui_strings/audio_only'),
    AudioOnly: jest.fn(),
  })
);

const { ENGLISH, SPANISH } = TestLanguageCode;

const firstRow = 'QWERTYUIOP';
const secondRow = `ASDFGHJKL'"`;
const thirdRow = 'ZXCVBNM,.-';
const fourthRow = 'space delete';

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
    <ScanPanelVirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={() => false}
    />
  );

  await waitFor(() => expect(getLanguageContext()).toBeDefined());

  const { setLanguage } = assertDefined(getLanguageContext());
  act(() => setLanguage(SPANISH));

  const keysSpokenInVoterLanguage = new Set([',', '.', "'", '"', '-']);

  // Ignore last row of keys (delete, space) because they don't fit this pattern
  for (const row of US_ENGLISH_SCAN_PANEL_KEYMAP.rows.slice(0, -1)) {
    const rowSearchValue = row
      .map((panel) => panel.keys.map((keySpec) => keySpec.value).join(''))
      .join('');
    for (const panel of row) {
      const panelSearchValue = panel.keys
        .map((keySpec) => keySpec.value)
        .join('');
      for (const key of panel.keys) {
        // Click the relevant row. After each keypress focus will reset and
        // rows, not individual keys, will be clickable again.
        userEvent.click(
          screen.getByText(hasTextAcrossElements(rowSearchValue))
        );
        // Click the relevant scan panel
        userEvent.click(
          screen.getByText(hasTextAcrossElements(panelSearchValue))
        );

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
  }

  function clickLastRowAndScanPanel() {
    // The last row has only one scan panel, so we click the "same" button twice
    // Click row
    userEvent.click(screen.getButton('space delete'));
    // Click scan panel
    userEvent.click(screen.getButton('space delete'));
  }

  clickLastRowAndScanPanel();
  const spaceBar = screen.getButton(
    `space ${getMockAudioOnlyTextPrefix(SPANISH)} space`
  );
  userEvent.click(spaceBar);
  expect(onKeyPress).lastCalledWith(' ');

  clickLastRowAndScanPanel();
  expect(onBackspace).not.toHaveBeenCalled();

  userEvent.click(
    screen.getButton(`delete ${getMockAudioOnlyTextPrefix(SPANISH)} delete`)
  );
  expect(onBackspace).toHaveBeenCalled();
});

test('supports tab and enter keypresses to navigate the keyboard', () => {
  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  render(
    <ScanPanelVirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={() => false}
    />
  );

  const firstRowElement = screen.getByText(hasTextAcrossElements(firstRow));
  expect(firstRowElement).toHaveFocus();
  userEvent.tab();
  expect(screen.getByText(hasTextAcrossElements(secondRow))).toHaveFocus();
  userEvent.tab();
  expect(screen.getByText(hasTextAcrossElements(thirdRow))).toHaveFocus();
  userEvent.tab();
  expect(screen.getByText(hasTextAcrossElements(fourthRow))).toHaveFocus();
  // The next tab event will focus the whole keyboard, so tab twice to cycle around
  userEvent.tab();
  userEvent.tab();
  expect(firstRowElement).toHaveFocus();

  userEvent.keyboard('{enter}');
  expect(screen.getByText(hasTextAcrossElements('QWER'))).toHaveFocus();
  userEvent.tab();
  expect(screen.getByText(hasTextAcrossElements('TYU'))).toHaveFocus();
  userEvent.keyboard('{enter}');
  // Need to use slower getButton here because getByText will find the child <span>
  expect(
    screen.getButton(`T ${getMockAudioOnlyTextPrefix(ENGLISH)} T`)
  ).toHaveFocus();
  expect(onKeyPress).not.toHaveBeenCalled();
  userEvent.keyboard('{enter}');
  expect(onKeyPress).toHaveBeenCalledWith('T');
});

test("doesn't fire key events for disabled keys", () => {
  const mPanel = 'BNM';

  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  render(
    <ScanPanelVirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={(k) => k === 'M'}
    />
  );

  userEvent.click(screen.getByText(hasTextAcrossElements(thirdRow)));
  userEvent.click(screen.getByText(hasTextAcrossElements(mPanel)));

  userEvent.click(screen.getButton(/\bM\b/));
  expect(onKeyPress).not.toHaveBeenCalled();
});

test('custom keymap', () => {
  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  render(
    <ScanPanelVirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={(k) => k === 'M'}
      keyMap={{
        rows: [
          [
            {
              keys: [
                { value: '😂', renderAudioString: () => 'lol' },
                {
                  value: '✨',
                  renderAudioString: () => 'magic',
                  renderLabel: () => 'magic',
                },
              ],
            },
          ],
        ],
      }}
    />
  );

  // Click twice, once for row and once for scan panel
  userEvent.click(screen.getByText(hasTextAcrossElements('😂magic')));
  userEvent.click(screen.getByText(hasTextAcrossElements('😂magic')));

  userEvent.click(
    screen.getButton(`😂 ${getMockAudioOnlyTextPrefix(ENGLISH)} lol`)
  );
  expect(onKeyPress).lastCalledWith('😂');

  // Click row and panel again after focus has reset
  userEvent.click(screen.getByText(hasTextAcrossElements('😂magic')));
  userEvent.click(screen.getByText(hasTextAcrossElements('😂magic')));
  userEvent.click(
    screen.getButton(`magic ${getMockAudioOnlyTextPrefix(ENGLISH)} magic`)
  );
  expect(onKeyPress).lastCalledWith('✨');
});
