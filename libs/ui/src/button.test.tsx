import { describe, expect, test, vi } from 'vitest';
import React from 'react';
import { ColorMode, SizeMode } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen } from '../test/react_testing_library';
import {
  BUTTON_VARIANTS,
  Button,
  ButtonColor,
  ButtonFill,
  LabelButton,
  LoadingButton,
} from './button';
import { makeTheme } from './themes/make_theme';
import { Icons } from './icons';

function createTouchStartEventProperties(x: number, y: number) {
  return { touches: [{ clientX: x, clientY: y }] };
}

function createTouchEndEventProperties(x: number, y: number) {
  return { changedTouches: [{ clientX: x, clientY: y }] };
}

function percentToPx(percent: string): number {
  if (!percent) {
    return 0;
  }

  assert(percent.endsWith('%'), `Expected ${percent} to end with '%'`);

  return (
    (Number.parseFloat(percent) / 100) *
    Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize
    )
  );
}

describe('Button', () => {
  test('renders all available variants', () => {
    for (const variant of BUTTON_VARIANTS) {
      const onPress = vi.fn();

      render(
        <Button onPress={onPress} variant={variant}>
          {variant} button
        </Button>
      );

      expect(onPress).not.toHaveBeenCalled();

      userEvent.click(screen.getButton(`${variant} button`));

      expect(onPress).toHaveBeenCalled();
    }
  });

  // FIXME: Re-enable this test.
  // It's failing with the following error:
  //   Error: Expected 1rem to end with '%'
  test.skip('varies size based on theme', () => {
    const onPress = vi.fn();

    function getButtonFontSizePx(sizeMode: SizeMode) {
      render(<Button onPress={onPress}>{sizeMode} button</Button>, {
        vxTheme: { colorMode: 'contrastMedium', sizeMode },
      });

      const button = screen.getButton(`${sizeMode} button`);

      return percentToPx(window.getComputedStyle(button).fontSize);
    }

    const smallButtonFontSizePx = getButtonFontSizePx('touchSmall');
    const mediumButtonFontSizePx = getButtonFontSizePx('touchMedium');
    const largeButtonFontSizePx = getButtonFontSizePx('touchLarge');
    const xLargeButtonFontSizePx = getButtonFontSizePx('touchExtraLarge');
    const desktopButtonFontSizePx = getButtonFontSizePx('desktop');

    expect(mediumButtonFontSizePx).toBeGreaterThan(smallButtonFontSizePx);
    expect(largeButtonFontSizePx).toBeGreaterThan(mediumButtonFontSizePx);
    expect(xLargeButtonFontSizePx).toBeGreaterThan(largeButtonFontSizePx);
    expect(desktopButtonFontSizePx).toEqual(16);
  });

  test('varies color based on theme', () => {
    const onPress = vi.fn();

    function verifyPrimaryButtonColor(colorMode: ColorMode) {
      const theme = makeTheme({ colorMode, sizeMode: 'touchSmall' });

      render(
        <Button onPress={onPress} variant="primary">
          {colorMode} button
        </Button>,
        { vxTheme: theme }
      );

      const button = screen.getButton(`${colorMode} button`);
      expect(button).toHaveStyleRule(
        `background-color: ${theme.colors.primary}`
      );
      expect(button).toHaveStyleRule(`color: ${theme.colors.onPrimary}`);
    }

    verifyPrimaryButtonColor('desktop');
    verifyPrimaryButtonColor('contrastLow');
    verifyPrimaryButtonColor('contrastMedium');
    verifyPrimaryButtonColor('contrastHighDark');
    verifyPrimaryButtonColor('contrastHighLight');
  });

  test('applies hover styling for desktop theme', () => {
    const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
    const expectedHoverStyles: Record<ButtonFill, string> = {
      filled: `filter: 'saturate(1.2) brightness(1.1)'`,
      tinted: `filter: 'saturate(1.3) brightness(0.95)'`,
      outlined: `background-color: ${theme.colors.primaryContainer}`,
      transparent: `background-color: ${theme.colors.primaryContainer}`,
    };

    for (const [fill, expectedHoverStyle] of Object.entries(
      expectedHoverStyles
    )) {
      const { unmount } = render(
        <Button onPress={vi.fn()} color="primary" fill={fill as ButtonFill}>
          Hover me
        </Button>,
        { vxTheme: theme }
      );

      const button = screen.getButton('Hover me');
      userEvent.hover(button);
      expect(button).toHaveStyleRule(expectedHoverStyle);
      unmount();
    }
  });

  test('does not apply hover styling for touch themes', () => {
    const theme = makeTheme({
      colorMode: 'contrastHighLight',
      sizeMode: 'touchSmall',
    });
    render(<Button onPress={vi.fn()}>Hover me</Button>, { vxTheme: theme });
    const button = screen.getButton('Hover me');
    const buttonStyles = window.getComputedStyle(button);
    userEvent.hover(button);
    expect(JSON.stringify(window.getComputedStyle(button))).toEqual(
      JSON.stringify(buttonStyles)
    );
  });

  test('propagates click/tap events with specified event value', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onPress = vi.fn((_value: [string, string]) => undefined);
    render(
      <Button onPress={onPress} value={['foo', 'bar']}>
        Click me
      </Button>
    );

    userEvent.click(screen.getButton('Click me'));

    expect(onPress).toHaveBeenCalledWith(['foo', 'bar']);
  });

  test('variant danger', () => {
    const theme = makeTheme({
      colorMode: 'contrastMedium',
      sizeMode: 'touchMedium',
    });
    render(
      <Button onPress={vi.fn()} variant="danger">
        I’m a dangerous button!
      </Button>,
      { vxTheme: theme }
    );
    const button = screen.getButton('I’m a dangerous button!');
    expect(button).toHaveStyleRule('background-color', theme.colors.danger);
    expect(button).toHaveStyleRule('color', theme.colors.onDanger);
  });

  test('disabled button', () => {
    const onPress = vi.fn();

    render(
      <div>
        <Button onPress={onPress} variant="danger" disabled>
          Disabled Button
        </Button>
      </div>,
      { vxTheme: { colorMode: 'contrastLow', sizeMode: 'touchMedium' } }
    );

    const disabledButton = screen.getButton('Disabled Button');
    expect(disabledButton).toBeDisabled();

    // Ignores click/tap events:
    userEvent.click(disabledButton);
    fireEvent.touchStart(
      disabledButton,
      createTouchStartEventProperties(100, 100)
    );
    fireEvent.touchEnd(disabledButton, createTouchEndEventProperties(100, 100));
    expect(onPress).not.toHaveBeenCalled();

    expect(disabledButton).toHaveStyleRule('border-style: dashed');
  });

  test('fills in background of outlined disabled buttons in desktop theme', () => {
    const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
    const expectedBackgroundColors: Record<ButtonColor, string> = {
      primary: theme.colors.container,
      danger: theme.colors.container,
      neutral: theme.colors.container,
      inverseNeutral: theme.colors.inverseContainer,
      inversePrimary: theme.colors.inverseContainer,
    };

    for (const [color, expectedBackgroundColor] of Object.entries(
      expectedBackgroundColors
    )) {
      const { unmount } = render(
        <Button
          onPress={vi.fn()}
          fill="outlined"
          color={color as ButtonColor}
          disabled
        >
          Disabled Button
        </Button>,
        { vxTheme: theme }
      );
      expect(screen.getButton('Disabled Button')).toHaveStyleRule(
        `background-color: ${expectedBackgroundColor}`
      );
      unmount();
    }
  });

  test('with icon component', () => {
    render(
      <Button icon={<Icons.Add />} onPress={vi.fn()}>
        Add
      </Button>
    );
    const button = screen.getButton('Add');
    const icons = button.getElementsByTagName('svg');
    expect(icons).toHaveLength(1);
    const [icon] = icons;
    expect(icon).toHaveAttribute('data-icon', 'circle-plus');
    expect(button.firstChild).toEqual(icon);
  });

  test('with icon name', () => {
    render(
      <Button icon="Add" onPress={vi.fn()}>
        Add
      </Button>
    );
    const button = screen.getButton('Add');
    const icons = button.getElementsByTagName('svg');
    expect(icons).toHaveLength(1);
    const [icon] = icons;
    expect(icon).toHaveAttribute('data-icon', 'circle-plus');
    expect(button.firstChild).toEqual(icon);
  });

  test('with rightIcon component', () => {
    render(
      <Button rightIcon={<Icons.Add />} onPress={vi.fn()}>
        Add
      </Button>
    );
    const button = screen.getButton('Add');
    const icons = button.getElementsByTagName('svg');
    expect(icons).toHaveLength(1);
    const [icon] = icons;
    expect(icon).toHaveAttribute('data-icon', 'circle-plus');
    expect(button.lastChild).toEqual(icon);
  });

  test('with rightIcon name', () => {
    render(
      <Button rightIcon="Add" onPress={vi.fn()}>
        Add
      </Button>
    );
    const button = screen.getButton('Add');
    const icons = button.getElementsByTagName('svg');
    expect(icons).toHaveLength(1);
    const [icon] = icons;
    expect(icon).toHaveAttribute('data-icon', 'circle-plus');
    expect(button.lastChild).toEqual(icon);
  });

  test('focus()/blur() API', () => {
    const buttonRef = React.createRef<Button>();

    render(
      <Button onPress={vi.fn()} ref={buttonRef}>
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
    const onPress = vi.fn();

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

  test('handles clicks and touches', () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Test Button</Button>);
    const button = screen.getButton('Test Button');

    // Keyboard (also Accessible Controller) fire click event which calls onPress.
    userEvent.click(button);
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
  });

  test('renders as label', () => {
    render(<LabelButton>I am a label</LabelButton>);
    expect(screen.getByText('I am a label').tagName.toLowerCase()).toEqual(
      'label'
    );
  });

  test('triggers form submit with type submit', () => {
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Submit</Button>
      </form>
    );
    userEvent.click(screen.getButton('Submit'));
    expect(onSubmit).toHaveBeenCalled();
  });

  test('triggers form reset with type reset', () => {
    const onReset = vi.fn();
    render(
      <form onReset={onReset}>
        <Button type="reset">Reset</Button>
      </form>
    );
    userEvent.click(screen.getButton('Reset'));
    expect(onReset).toHaveBeenCalled();
  });

  test('still calls onPress with type submit', () => {
    const onPress = vi.fn();
    render(
      <form>
        <Button type="submit" onPress={onPress}>
          Submit
        </Button>
      </form>
    );
    userEvent.click(screen.getButton('Submit'));
    expect(onPress).toHaveBeenCalled();
  });

  test('still passes a value to onPress with type submit', () => {
    const onPress = vi.fn();
    render(
      <form>
        <Button type="submit" onPress={onPress} value="foo">
          Submit
        </Button>
      </form>
    );
    userEvent.click(screen.getButton('Submit'));
    expect(onPress).toHaveBeenCalledWith('foo');
  });

  test('still calls onPress with type reset', () => {
    const onPress = vi.fn();
    render(
      <form>
        <Button type="reset" onPress={onPress}>
          Reset
        </Button>
      </form>
    );
    userEvent.click(screen.getButton('Reset'));
    expect(onPress).toHaveBeenCalled();
  });

  test('still passes a value to onPress with type reset', () => {
    const onPress = vi.fn();
    render(
      <form>
        <Button type="reset" onPress={onPress} value="foo">
          Reset
        </Button>
      </form>
    );
    userEvent.click(screen.getButton('Reset'));
    expect(onPress).toHaveBeenCalledWith('foo');
  });

  test('does not trigger form submit when disabled', () => {
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" disabled>
          Submit
        </Button>
      </form>
    );
    userEvent.click(screen.getButton('Submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('does not trigger form reset when disabled', () => {
    const onReset = vi.fn();
    render(
      <form onReset={onReset}>
        <Button type="reset" disabled>
          Reset
        </Button>
      </form>
    );
    userEvent.click(screen.getButton('Reset'));
    expect(onReset).not.toHaveBeenCalled();
  });
});

describe('LoadingButton', () => {
  test('is disabled and shows spinner', () => {
    render(<LoadingButton>Saving...</LoadingButton>);
    const button = screen.getButton('Saving...');
    expect(button).toBeDisabled();
    const icons = button.getElementsByTagName('svg');
    expect(icons).toHaveLength(1);
    const [icon] = icons;
    expect(icon).toHaveAttribute('data-icon', 'spinner');
    expect(button.firstChild).toEqual(icon);
  });
});
