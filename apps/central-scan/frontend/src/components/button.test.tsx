import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

function createTouchStartEventProperties(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] };
}

function createTouchEndEventProperties(x: number, y: number) {
  return { changedTouches: [{ clientX: x, clientY: y }] };
}

describe('Button', () => {
  test('triggers onPress with click', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Button</Button>);
    const button = screen.getByText('Button');
    userEvent.click(button);
    expect(onPress).toHaveBeenCalled();
  });

  test('triggers onPress with touch', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Button</Button>);
    const button = screen.getByText('Button');
    fireEvent.touchStart(button, createTouchStartEventProperties(100, 100));
    fireEvent.touchEnd(button, createTouchEndEventProperties(100, 100));
    expect(onPress).toHaveBeenCalled();
  });

  test('does not trigger onPress with click when disabled', () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} disabled>
        Button
      </Button>
    );
    const button = screen.getByText('Button');
    userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('does not trigger onPress with touch when disabled', () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} disabled>
        Button
      </Button>
    );
    const button = screen.getByText('Button');
    fireEvent.touchStart(button, createTouchStartEventProperties(100, 100));
    fireEvent.touchEnd(button, createTouchEndEventProperties(100, 100));
    expect(onPress).not.toHaveBeenCalled();
  });
});
