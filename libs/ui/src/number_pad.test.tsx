import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NumberPad } from './number_pad';

test('snapshot', () => {
  const { container } = render(
    <NumberPad
      onButtonPress={jest.fn()}
      onBackspace={jest.fn()}
      onClear={jest.fn()}
    />
  );

  expect(container.firstChild).toMatchSnapshot();
});

test('click all pad buttons', () => {
  const onPress = jest.fn();
  const onBackspace = jest.fn();
  const onClear = jest.fn();
  const { getByText } = render(
    <NumberPad
      onButtonPress={onPress}
      onBackspace={onBackspace}
      onClear={onClear}
    />
  );
  const button0 = getByText('0');
  userEvent.click(button0);
  const button1 = getByText('1');
  userEvent.click(button1);
  const button2 = getByText('2');
  userEvent.click(button2);
  const button3 = getByText('3');
  userEvent.click(button3);
  const button4 = getByText('4');
  userEvent.click(button4);
  const button5 = getByText('5');
  userEvent.click(button5);
  const button6 = getByText('6');
  userEvent.click(button6);
  const button7 = getByText('7');
  userEvent.click(button7);
  const button8 = getByText('8');
  userEvent.click(button8);
  const button9 = getByText('9');
  userEvent.click(button9);
  for (let digit = 0; digit <= 9; digit += 1) {
    expect(onPress).toHaveBeenCalledWith(digit);
  }
  expect(onPress).toHaveBeenCalledTimes(10);

  const backspaceButton = getByText('⌫');
  userEvent.click(backspaceButton);
  expect(onBackspace).toHaveBeenCalledTimes(1);

  const clearButton = getByText('✖');
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

test('keyboard interaction', async () => {
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
});
