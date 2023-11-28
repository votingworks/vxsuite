import userEvent from '@testing-library/user-event';
import { buttonPressEventMatcher } from '@votingworks/test-utils';
import { render, screen } from '../test/react_testing_library';
import { VirtualKeyboard } from './virtual_keyboard';

test('fires key events', () => {
  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  render(
    <VirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={() => false}
    />
  );

  const text = 'THE QUICK, BROWN FOX JUMPED OVER THE LAZY DOG.';
  const specialCharKeyNames: Record<string, string> = {
    ' ': 'space',
    ',': 'comma',
    '.': 'period',
  };

  for (const letter of text) {
    const keyName = specialCharKeyNames[letter] || letter;
    userEvent.click(screen.getButton(keyName));
    expect(onKeyPress).lastCalledWith(letter, buttonPressEventMatcher());
  }

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

  userEvent.click(screen.getButton('M'));
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
            { label: '😅' },
            { label: '😂' },
            { label: '✨', ariaLabel: 'magic' },
          ],
        ],
      }}
    />
  );

  userEvent.click(screen.getButton('😅'));
  expect(onKeyPress).lastCalledWith('😅', buttonPressEventMatcher());

  userEvent.click(screen.getButton('😂'));
  expect(onKeyPress).lastCalledWith('😂', buttonPressEventMatcher());

  userEvent.click(screen.getButton('magic'));
  expect(onKeyPress).lastCalledWith('✨', buttonPressEventMatcher());
});
