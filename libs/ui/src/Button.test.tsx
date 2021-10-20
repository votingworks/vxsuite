import React from 'react';
import { fireEvent, render } from '@testing-library/react';

import { Button, DecoyButton } from './Button';

function createTouchStartEventProperties(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] };
}

function createTouchEndEventProperties(x: number, y: number) {
  return { changedTouches: [{ clientX: x, clientY: y }] };
}

describe('renders Button', () => {
  test('with defaults', () => {
    const { container } = render(<Button onPress={jest.fn()}>foo</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with options: primary noFocus', () => {
    const { container } = render(
      <Button onPress={jest.fn()} primary noFocus>
        Primary
      </Button>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with options: full-width disabled submit', () => {
    const { container } = render(
      <Button onPress={jest.fn()} type="submit" disabled fullWidth>
        Disabled Button
      </Button>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('with options: big danger', () => {
    const { container } = render(
      <Button onPress={jest.fn()} large danger>
        I’m a big button!
      </Button>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('as DecoyButton with options: small warning', () => {
    const { container } = render(
      <DecoyButton small warning>
        DecoyButton
      </DecoyButton>
    );
    expect(container.firstChild).toMatchSnapshot();
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
