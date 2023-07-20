import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { VirtualKeyboard } from './virtual_keyboard';

test('fires key events', async () => {
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
    await userEvent.click(screen.getButton(keyName));
    expect(onKeyPress).lastCalledWith(letter);
  }

  expect(onBackspace).not.toHaveBeenCalled();

  await userEvent.click(screen.getButton('delete'));
  expect(onBackspace).toHaveBeenCalled();
});

test("doesn't fire key events for disabled keys", async () => {
  const onKeyPress = jest.fn();
  const onBackspace = jest.fn();

  render(
    <VirtualKeyboard
      onBackspace={onBackspace}
      onKeyPress={onKeyPress}
      keyDisabled={(k) => k === 'M'}
    />
  );

  await userEvent.click(screen.getButton('M'));
  expect(onKeyPress).not.toHaveBeenCalled();
});

test('custom keymap', async () => {
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

  await userEvent.click(screen.getButton('😅'));
  expect(onKeyPress).lastCalledWith('😅');

  await userEvent.click(screen.getButton('😂'));
  expect(onKeyPress).lastCalledWith('😂');

  await userEvent.click(screen.getButton('magic'));
  expect(onKeyPress).lastCalledWith('✨');
});
