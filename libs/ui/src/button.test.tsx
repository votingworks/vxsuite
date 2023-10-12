import React from 'react';
import parseCssColor from 'parse-css-color';
import { Color, ColorMode, SizeMode } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { fireEvent, render, screen } from '../test/react_testing_library';
import { ALL_BUTTON_VARIANTS, Button, DecoyButton } from './button';
import { makeTheme } from './themes/make_theme';

function createTouchStartEventProperties(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] };
}

function createTouchEndEventProperties(x: number, y: number) {
  return { changedTouches: [{ clientX: x, clientY: y }] };
}

function remToPx(rem: string): number {
  if (!rem) {
    return 0;
  }

  return (
    Number.parseFloat(rem) *
    Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize
    )
  );
}

describe('renders Button', () => {
  test('for all available variants', () => {
    for (const variant of ALL_BUTTON_VARIANTS) {
      const onPress = jest.fn();

      render(
        <Button onPress={onPress} variant={variant}>
          {variant} button
        </Button>
      );

      expect(onPress).not.toHaveBeenCalled();

      fireEvent.click(screen.getButton(`${variant} button`));

      expect(onPress).toHaveBeenCalled();
    }
  });

  test('varies size based on theme', () => {
    const onPress = jest.fn();

    function getButtonFontSizePx(sizeMode: SizeMode) {
      render(<Button onPress={onPress}>{sizeMode} button</Button>, {
        vxTheme: { colorMode: 'contrastMedium', sizeMode },
      });

      const button = screen.getButton(`${sizeMode} button`);
      return remToPx(window.getComputedStyle(button).fontSize);
    }

    const smallButtonFontSizePx = getButtonFontSizePx('s');
    const mediumButtonFontSizePx = getButtonFontSizePx('m');
    const largeButtonFontSizePx = getButtonFontSizePx('l');
    const xLargeButtonFontSizePx = getButtonFontSizePx('xl');

    expect(mediumButtonFontSizePx).toBeGreaterThan(smallButtonFontSizePx);
    expect(largeButtonFontSizePx).toBeGreaterThan(mediumButtonFontSizePx);
    expect(xLargeButtonFontSizePx).toBeGreaterThan(largeButtonFontSizePx);
  });

  test('varies color based on theme', () => {
    const onPress = jest.fn();

    function verifyPrimaryButtonColor(colorMode: ColorMode) {
      const expectedTheme = makeTheme({ colorMode, sizeMode: 's' });

      render(
        <Button onPress={onPress} variant="primary">
          {colorMode} button
        </Button>,
        {
          vxTheme: { colorMode, sizeMode: 's' },
        }
      );

      const button = screen.getButton(`${colorMode} button`);
      const buttonColor = window.getComputedStyle(button).backgroundColor;

      expect(parseCssColor(buttonColor)).toEqual(
        parseCssColor(expectedTheme.colors.accentPrimary)
      );
    }

    verifyPrimaryButtonColor('contrastLow');
    verifyPrimaryButtonColor('contrastMedium');
    verifyPrimaryButtonColor('contrastHighDark');
    verifyPrimaryButtonColor('contrastHighLight');
  });

  test('propagates click/tap events with specified event value', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onPress = jest.fn((_value: [string, string]) => undefined);
    render(
      <Button onPress={onPress} value={['foo', 'bar']}>
        Click me
      </Button>
    );

    fireEvent.click(screen.getButton('Click me'));

    expect(onPress).toHaveBeenCalledWith(['foo', 'bar']);
  });

  test('legacy fullWidth button', () => {
    render(
      <Button onPress={jest.fn()} fullWidth>
        Full Width Button
      </Button>
    );
    const button = screen.getButton('Full Width Button');
    expect(button).toHaveStyleRule('width', '100%');
  });

  test('with options: big danger', () => {
    render(
      <Button onPress={jest.fn()} large variant="danger">
        I’m a big button!
      </Button>
    );
    const button = screen.getButton('I’m a big button!');
    expect(button).toHaveStyleRule('padding', '1em 1.75em');
    expect(button).toHaveStyleRule('font-size', '1.25em');
    expect(button).toHaveStyleRule('background', Color.LEGACY_ACCENT_DANGER);
    expect(button).toHaveStyleRule('color', Color.WHITE);
  });

  test('disabled button', () => {
    const onPress = jest.fn();

    render(
      <div>
        <Button onPress={onPress} variant="danger">
          Enabled Button
        </Button>
        <Button onPress={onPress} variant="danger" disabled>
          Disabled Button
        </Button>
      </div>,
      { vxTheme: { colorMode: 'contrastLow', sizeMode: 'm' } }
    );

    const enabledButton = screen.getButton('Enabled Button');
    const disabledButton = screen.getButton('Disabled Button');

    // Ignores click/tap events:
    fireEvent.click(disabledButton);
    fireEvent.touchStart(
      disabledButton,
      createTouchStartEventProperties(100, 100)
    );
    fireEvent.touchEnd(disabledButton, createTouchEndEventProperties(100, 100));
    expect(onPress).not.toHaveBeenCalled();

    const enabledButtonColor =
      window.getComputedStyle(enabledButton).backgroundColor;
    const disabledButtonColor =
      window.getComputedStyle(disabledButton).backgroundColor;
    expect(parseCssColor(disabledButtonColor)).not.toEqual(
      parseCssColor(enabledButtonColor)
    );
  });

  test('focus()/blur() API', () => {
    const buttonRef = React.createRef<Button>();

    render(
      <Button onPress={jest.fn()} ref={buttonRef}>
        Focus on me
      </Button>
    );

    const buttonElement = screen.getButton('Focus on me');
    expect(buttonElement).not.toHaveFocus();

    assert(buttonRef.current);
    buttonRef.current.focus();
    expect(buttonElement).toHaveFocus();

    buttonRef.current.blur();
    expect(buttonElement).not.toHaveFocus();
  });

  test('autoFocus option', () => {
    const onPress = jest.fn();

    render(
      <div>
        <Button onPress={onPress}>Cancel</Button>
        <Button onPress={onPress} variant="primary" autoFocus>
          Confirm
        </Button>
      </div>
    );

    expect(screen.getButton('Confirm')).toHaveFocus();
  });

  test('as DecoyButton with options: small warning', () => {
    render(
      <DecoyButton small variant="warning">
        DecoyButton
      </DecoyButton>
    );
    const button = screen.getByText('DecoyButton');
    expect(button).toHaveStyleRule('background', Color.LEGACY_ACCENT_WARNING);
    expect(button).toHaveStyleRule('padding', '0.35em 0.5em');
  });

  test('and tests clicks and touches', () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Test Button</Button>);
    const button = screen.getButton('Test Button');

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
