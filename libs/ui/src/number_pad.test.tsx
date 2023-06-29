import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '../test/react_testing_library';

import { NumberPad } from './number_pad';

test('click all pad buttons', () => {
  const onPress = jest.fn();
  const onBackspace = jest.fn();
  const onClear = jest.fn();
  render(
    <NumberPad
      onButtonPress={onPress}
      onBackspace={onBackspace}
      onClear={onClear}
    />
  );
  for (let digit = 0; digit <= 9; digit += 1) {
    userEvent.click(screen.getButton(`${digit}`));
    expect(onPress).toHaveBeenCalledWith(digit);
  }
  expect(onPress).toHaveBeenCalledTimes(10);

  const backspaceButton = screen.getButton('backspace');
  userEvent.click(backspaceButton);
  expect(onBackspace).toHaveBeenCalledTimes(1);

  const clearButton = screen.getButton('clear');
  userEvent.click(clearButton);
  expect(onClear).toHaveBeenCalledTimes(1);
});

// FIXME: It'd be great to use `userEvent.keyboard`, but it doesn't work.
// Maybe because the focused element is a `div`? But if it has a tab index
// then it should work? ¯\_(ツ)_/¯
//
//   userEvent.keyboard('0123456789')
//
function sendKey(key: string): void {
  const charCode = key === 'Backspace' ? undefined : key.charCodeAt(0);
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key,
    charCode,
  });
  if (charCode !== undefined) {
    fireEvent.keyPress(document.activeElement ?? document.body, {
      key,
      charCode,
    });
  }
  fireEvent.keyUp(document.activeElement ?? document.body, {
    key,
    charCode,
  });
}

test('keyboard interaction', () => {
  const onPress = jest.fn();
  const onBackspace = jest.fn();
  const onClear = jest.fn();
  const { container } = render(
    <NumberPad
      onButtonPress={onPress}
      onBackspace={onBackspace}
      onClear={onClear}
    />
  );
  container.focus();

  // some keys should be ignored
  sendKey('z');
  expect(onPress).not.toHaveBeenCalled();
  expect(onBackspace).not.toHaveBeenCalled();
  expect(onClear).not.toHaveBeenCalled();

  for (let digit = 0; digit <= 9; digit += 1) {
    sendKey(`${digit}`);
  }

  for (let digit = 0; digit <= 9; digit += 1) {
    expect(onPress).toHaveBeenCalledWith(digit);
  }

  expect(onPress).toHaveBeenCalledTimes(10);

  sendKey('Backspace');
  expect(onBackspace).toHaveBeenCalledTimes(1);

  sendKey('x');
  expect(onClear).toHaveBeenCalledTimes(1);

  sendKey('Enter');
  // nothing should happen
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(onBackspace).toHaveBeenCalledTimes(1);
  expect(onPress).toHaveBeenCalledTimes(10);
});

test('keyboard interaction when onEnter is defined', () => {
  const onPress = jest.fn();
  const onBackspace = jest.fn();
  const onClear = jest.fn();
  const onEnter = jest.fn();
  const { container } = render(
    <NumberPad
      onButtonPress={onPress}
      onBackspace={onBackspace}
      onClear={onClear}
      onEnter={onEnter}
    />
  );
  container.focus();

  // some keys should be ignored
  sendKey('z');
  expect(onPress).not.toHaveBeenCalled();
  expect(onBackspace).not.toHaveBeenCalled();
  expect(onClear).not.toHaveBeenCalled();
  expect(onEnter).not.toHaveBeenCalled();

  for (let digit = 0; digit <= 9; digit += 1) {
    sendKey(`${digit}`);
  }

  for (let digit = 0; digit <= 9; digit += 1) {
    expect(onPress).toHaveBeenCalledWith(digit);
  }

  expect(onPress).toHaveBeenCalledTimes(10);

  sendKey('Backspace');
  expect(onBackspace).toHaveBeenCalledTimes(1);

  sendKey('x');
  expect(onClear).toHaveBeenCalledTimes(1);

  sendKey('Enter');
  expect(onEnter).toHaveBeenCalledTimes(1);
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(onBackspace).toHaveBeenCalledTimes(1);
  expect(onPress).toHaveBeenCalledTimes(10);
});

test('disabled state', () => {
  const onBackspace = jest.fn();
  const onButtonPress = jest.fn();
  const onClear = jest.fn();
  const onEnter = jest.fn();
  const { container } = render(
    <NumberPad
      disabled
      onBackspace={onBackspace}
      onButtonPress={onButtonPress}
      onClear={onClear}
      onEnter={onEnter}
    />
  );
  container.focus();

  for (let digit = 0; digit <= 9; digit += 1) {
    sendKey(`${digit}`);
  }
  sendKey('Backspace');
  sendKey('x');
  sendKey('Enter');

  expect(onBackspace).not.toHaveBeenCalled();
  expect(onButtonPress).not.toHaveBeenCalled();
  expect(onClear).not.toHaveBeenCalled();
  expect(onEnter).not.toHaveBeenCalled();
});
