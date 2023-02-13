import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, DecoyButton } from './button';

function createTouchStartEventProperties(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] };
}

function createTouchEndEventProperties(x: number, y: number) {
  return { changedTouches: [{ clientX: x, clientY: y }] };
}

describe('renders Button', () => {
  test('with defaults', () => {
    render(<Button onPress={jest.fn()}>default</Button>);
    const button = screen.getByText('default');
    expect(button).toHaveStyleRule('background', 'rgb(211,211,211)');
    expect(button).toHaveStyleRule('cursor', 'pointer');
    expect(button).toHaveStyleRule('padding', '0.75em 1em');
    expect(button).toHaveStyleRule('text-align', 'center');
    expect(button).toHaveStyleRule('color', 'black');
    expect(button).toHaveStyleRule('color', 'black');
  });

  test('with options: primary noFocus', () => {
    render(
      <Button onPress={jest.fn()} primary noFocus>
        Primary
      </Button>
    );
    const button = screen.getByText('Primary');
    expect(button).toHaveStyleRule('background', 'rgb(71,167,75)');
    expect(button).toHaveStyleRule('color', '#FFFFFF');
    expect(button).not.toHaveStyleRule('outline');
  });

  test('with options: primaryBlue', () => {
    render(
      <Button onPress={jest.fn()} primaryBlue>
        PrimaryBlue
      </Button>
    );
    const button = screen.getByText('PrimaryBlue');
    expect(button).toHaveStyleRule('background', 'rgb(34,152,222)');
    expect(button).toHaveStyleRule('color', '#FFFFFF');
  });

  test('with options: full-width disabled submit', () => {
    render(
      <Button onPress={jest.fn()} type="submit" disabled fullWidth>
        Disabled Button
      </Button>
    );
    const button = screen.getByText('Disabled Button');
    expect(button).toHaveStyleRule('width', '100%');
    expect(button).toBeDisabled();
  });

  test('with options: big danger', () => {
    render(
      <Button onPress={jest.fn()} large danger>
        I’m a big button!
      </Button>
    );
    const button = screen.getByText('I’m a big button!');
    expect(button).toHaveStyleRule('padding', '1em 1.75em');
    expect(button).toHaveStyleRule('font-size', '1.25em');
    expect(button).toHaveStyleRule('background', 'red');
    expect(button).toHaveStyleRule('color', '#FFFFFF');
  });

  test('as DecoyButton with options: small warning', () => {
    render(
      <DecoyButton small warning>
        DecoyButton
      </DecoyButton>
    );
    const button = screen.getByText('DecoyButton');
    expect(button).toHaveStyleRule('background', 'darkorange');
    expect(button).toHaveStyleRule('padding', '0.35em 0.5em');
  });

  test('and tests clicks and touches', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress}>Test Button</Button>
    );
    const button = getByText('Test Button');

    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    // TouchEnd close to TouchStart calls onPress.
    fireEvent.touchStart(button, createTouchStartEventProperties(100, 100));
    fireEvent.touchEnd(button, createTouchEndEventProperties(110, 95));
    expect(onPress).toHaveBeenCalledTimes(2);

    // Using preventDefault() with touch prevents the click, so no need to test click de-duping.

    // TouchStart w/o TouchEnd does not call onPress.
    fireEvent.touchStart(button, createTouchStartEventProperties(100, 100));
    expect(onPress).toHaveBeenCalledTimes(2);

    // TouchEnd too far from TouchStart does not call onPress.
    fireEvent.touchEnd(button, createTouchEndEventProperties(131, 95));
    expect(onPress).toHaveBeenCalledTimes(2);

    // Keyboard (also Accessible Controller) fire click event which calls onPress.
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(3);
  });
});

test('disabling works for both touch events and click events', () => {
  const onPress = jest.fn();
  render(
    <Button onPress={onPress} disabled>
      Disabled Button
    </Button>
  );
  const button = screen.getByText('Disabled Button');

  // Click is disabled
  userEvent.click(button);
  expect(onPress).toHaveBeenCalledTimes(0);

  // Touch is disabled
  fireEvent.touchStart(button, createTouchStartEventProperties(100, 100));
  fireEvent.touchEnd(button, createTouchEndEventProperties(100, 100));
  expect(onPress).toHaveBeenCalledTimes(0);
});
