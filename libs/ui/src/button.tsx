import React, { PureComponent } from 'react';

import styled, { css, CSSObject, DefaultTheme } from 'styled-components';
import { SizeMode, SizeTheme, UiTheme } from '@votingworks/types';

import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { rgba } from 'polished';
import { IconName, Icons } from './icons';

const FONT_SIZE_REM = 1;

export const BUTTON_COLORS = [
  'primary',
  'neutral',
  'danger',
  'inversePrimary',
  'inverseNeutral',
] as const;
export const BUTTON_FILLS = [
  'filled',
  'tinted',
  'outlined',
  'transparent',
] as const;

export type ButtonColor = (typeof BUTTON_COLORS)[number];
export type ButtonFill = (typeof BUTTON_FILLS)[number];

interface VariantConfig {
  color: ButtonColor;
  fill: ButtonFill;
}

const buttonVariants = {
  neutral: { color: 'neutral', fill: 'outlined' },
  primary: { color: 'primary', fill: 'filled' },
  secondary: { color: 'primary', fill: 'tinted' },
  danger: { color: 'danger', fill: 'filled' },
  inverseNeutral: { color: 'inverseNeutral', fill: 'outlined' },
  inversePrimary: { color: 'inversePrimary', fill: 'filled' },
} satisfies Record<string, VariantConfig>;

export type ButtonVariant = keyof typeof buttonVariants;
export const BUTTON_VARIANTS = Object.keys(buttonVariants) as ButtonVariant[];

export type ClickHandler = () => void;
export type TypedClickHandler<T> = (value: T) => void;

export interface StyledButtonProps {
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  id?: string;
  role?: string;
  style?: React.CSSProperties;
  tabIndex?: number;

  icon?: IconName | JSX.Element;
  rightIcon?: IconName | JSX.Element;
  variant?: ButtonVariant;
  color?: ButtonColor;
  fill?: ButtonFill;
}

type ThemedStyledButtonProps = StyledButtonProps & { theme: UiTheme };

export type ButtonProps<T = undefined> = StyledButtonProps & {
  children?: React.ReactNode;

  /**
   * @deprecated NOTE: Title tooltips are not accessible and should not be used
   * for important information. Consider rendering the text on or near the
   * button.
   */
  nonAccessibleTitle?: string;
} & ( // Require a matching `value` if the provided click handler expects a value.
    | {
        onPress: ClickHandler;
        value?: never;
      }
    | {
        onPress: TypedClickHandler<T>;
        value: T;
      }
  );

function resolveIcon(icon: IconName | JSX.Element): JSX.Element {
  if (typeof icon === 'string') {
    const Component = Icons[icon];
    return <Component />;
  }
  return icon;
}

function resolveColorAndFill(p: ThemedStyledButtonProps): {
  color: ButtonColor;
  fill: ButtonFill;
} {
  const { color, fill }: { color: ButtonColor; fill: ButtonFill } = p.variant
    ? buttonVariants[p.variant]
    : { color: 'neutral', fill: 'outlined' };
  return {
    color: p.color ?? color,
    fill: p.fill ?? fill,
  };
}

function colorAndFillStyles(p: ThemedStyledButtonProps): CSSObject {
  // eslint-disable-next-line prefer-const
  let { color, fill } = resolveColorAndFill(p);
  const {
    theme: { colors, colorMode },
  } = p;

  // Style tinted buttons as filled buttons for touch themes, since we don't
  // have "tinted" colors to use.
  if (colorMode !== 'desktop' && fill === 'tinted') {
    fill = 'filled';
  }

  const styleSpecs: Record<ButtonColor, Record<ButtonFill, CSSObject>> = {
    primary: {
      filled: {
        backgroundColor: colors.primary,
        color: colors.onPrimary,
      },
      tinted: {
        backgroundColor: colors.primaryContainer,
        color: colors.primary,
      },
      outlined: {
        borderColor: colors.primary,
        color: colors.primary,
      },
      transparent: {
        color: colors.primary,
      },
    },

    neutral: {
      filled: {
        backgroundColor: colors.neutral,
        color: colors.onNeutral,
      },
      tinted: {
        backgroundColor: colors.container,
        color: colors.onBackground,
      },
      outlined: {
        borderColor: colors.outline,
        color: colors.onBackground,
      },
      transparent: {
        color: colors.onBackground,
      },
    },

    danger: {
      filled: {
        backgroundColor: colors.danger,
        color: colors.onDanger,
      },
      tinted: {
        backgroundColor: colors.dangerContainer,
        color: colors.danger,
      },
      outlined: {
        borderColor: colors.danger,
        color: colors.danger,
      },
      transparent: {
        color: colors.danger,
      },
    },

    inversePrimary: {
      filled: {
        backgroundColor: colors.inversePrimary,
        color: colors.onBackground,
      },
      tinted: {
        backgroundColor: colors.primary,
        color: colors.onPrimary,
      },
      outlined: {
        borderColor: colors.inversePrimary,
        color: colors.inversePrimary,
      },
      transparent: {
        color: colors.inversePrimary,
      },
    },

    inverseNeutral: {
      filled: {
        backgroundColor: colors.containerHigh,
        color: colors.onBackground,
      },
      tinted: {
        backgroundColor: colors.inverseContainer,
        color: colors.onInverse,
      },
      outlined: {
        borderColor: colors.onInverse,
        color: colors.onInverse,
      },
      transparent: {
        color: colors.onInverse,
      },
    },
  };
  const style = styleSpecs[color][fill];
  return {
    ...style,
    backgroundColor: style.backgroundColor ?? 'transparent',
    // Every button style has a border, that way all buttons are the same size.
    // For buttons with a background color but no border color (e.g.
    // filled/tinted), we set the border color to the background color so it's
    // invisible. For transparent buttons, we set the border color to
    // transparent so it's invisible.
    borderColor: style.borderColor ?? style.backgroundColor ?? 'transparent',
  };
}

function isInverse(color: ButtonColor) {
  return color === 'inverseNeutral' || color === 'inversePrimary';
}

function hoverStyles(p: ThemedStyledButtonProps): CSSObject {
  const { color, fill } = resolveColorAndFill(p);
  const {
    theme: { colors, colorMode },
  } = p;
  if (colorMode === 'desktop') {
    switch (fill) {
      case 'filled':
        return { filter: 'saturate(1.2) brightness(1.1)' };
      case 'tinted':
        return { filter: 'saturate(1.3) brightness(0.95)' };
      case 'outlined':
      case 'transparent':
        return {
          backgroundColor: {
            primary: colors.primaryContainer,
            neutral: rgba(colors.neutral, 0.1),
            danger: colors.dangerContainer,
            inversePrimary: rgba(colors.onInverse, 0.1),
            inverseNeutral: rgba(colors.onInverse, 0.1),
          }[color],
        };
      /* istanbul ignore next */
      default:
        return throwIllegalValue(fill);
    }
  }

  return {};
}

function activeStyles(p: ThemedStyledButtonProps): CSSObject {
  const {
    theme: { colorMode },
  } = p;
  // Generally, when a button is pressed, it changes the UI enough to provide
  // feedback that the button was pressed, so we don't use active styles. This
  // is especially important for controls that use Button as a subcomponent
  // (e.g. SegmentedButton), in which having an active style makes the state
  // transition from unselected to selected look jittery.
  if (colorMode === 'desktop') {
    return {};
  }

  return {
    boxShadow: `inset 0 0 0 0.15rem currentColor`,
  };
}

function disabledStyles(p: ThemedStyledButtonProps): CSSObject {
  const { color, fill } = resolveColorAndFill(p);
  const {
    theme: { colors, colorMode },
  } = p;
  if (colorMode === 'desktop') {
    return {
      backgroundColor:
        fill === 'outlined'
          ? isInverse(color)
            ? colors.inverseContainer
            : colors.container
          : undefined,
      filter: 'saturate(0.5) brightness(0.9)',
      borderStyle: 'dashed',
      borderColor: colors.outline,
    };
  }

  const backgroundColor = isInverse(color)
    ? colors.onBackground
    : colors.background;
  const foregroundColor = isInverse(color)
    ? colors.background
    : colors.onBackground;

  return {
    backgroundColor,
    borderStyle: 'dashed',
    color: foregroundColor,
    borderColor: foregroundColor,
  };
}

const paddingStyles: Record<SizeMode, string> = {
  desktop: '0.5rem 1.25rem',
  print: '0.5rem 1.25rem',
  touchSmall: '0.5rem 0.75rem',
  touchMedium: '0.5rem 0.75em',
  touchLarge: '0.35rem 0.35rem',
  touchExtraLarge: '0.15rem 0.2rem',
};

const gapStyles: Record<SizeMode, string> = {
  desktop: '0.5rem',
  print: '0.5rem',
  touchSmall: '0.5rem',
  touchMedium: '0.5rem',
  touchLarge: '0.25rem',
  touchExtraLarge: '0.25rem',
};

const borderWidths: Record<SizeMode, keyof SizeTheme['bordersRem']> = {
  desktop: 'thin',
  print: 'thin',
  touchSmall: 'medium',
  touchMedium: 'medium',
  touchLarge: 'thin',
  touchExtraLarge: 'thin',
};

function getBorderWidthRem(p: { theme: DefaultTheme }) {
  return p.theme.sizes.bordersRem[borderWidths[p.theme.sizeMode]];
}

export const buttonStyles = css<StyledButtonProps>`
  align-items: center;
  background: none;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border-style: solid;
  border-width: ${(p) => getBorderWidthRem(p)}rem;
  box-shadow: none;
  box-sizing: border-box;
  cursor: pointer;
  display: inline-flex;
  flex-wrap: ${(p) => (p.rightIcon ? 'wrap-reverse' : 'wrap')};
  font-family: inherit;
  font-size: ${FONT_SIZE_REM}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: ${(p) => gapStyles[p.theme.sizeMode]};
  justify-content: center;
  letter-spacing: ${(p) => p.theme.sizes.letterSpacingEm}em;
  line-height: ${(p) => p.theme.sizes.lineHeight};
  min-height: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;
  padding: ${(p) => paddingStyles[p.theme.sizeMode]};
  text-align: center;
  text-shadow: none;
  touch-action: manipulation;
  transition: 100ms ease-in;
  transition-property: background, background-color, filter, border, box-shadow,
    color, opacity;
  vertical-align: middle;
  width: auto;

  ${(p) => css(colorAndFillStyles(p))}

  &:hover:enabled {
    ${(p) => css(hoverStyles(p))}
  }

  &:active:enabled {
    ${(p) => css(activeStyles(p))}
  }

  &[disabled] {
    ${(p) => css(disabledStyles(p))}
    box-shadow: none;
    cursor: not-allowed;
  }
`;

const StyledButton = styled('button').attrs(({ type = 'button' }) => ({
  type,
}))`
  ${buttonStyles}
`;

const TextContainer = styled.span`
  display: inline-block;
`;

interface ButtonState {
  startCoordinates: [number, number];
}

export class Button<T = undefined> extends PureComponent<
  ButtonProps<T>,
  ButtonState
> {
  private readonly buttonRef = React.createRef<HTMLButtonElement>();

  constructor(props: ButtonProps<T>) {
    super(props);
    this.state = { startCoordinates: [0, 0] };
  }

  private readonly onTouchStart = (event: React.TouchEvent): void => {
    const { clientX, clientY } = event.touches[0];
    this.setState({ startCoordinates: [clientX, clientY] });
  };

  private readonly onTouchEnd = (
    event: React.TouchEvent<HTMLButtonElement>
  ): void => {
    const { disabled } = this.props;
    const { startCoordinates } = this.state;

    const maxMove = 30;
    const { clientX, clientY } = event.changedTouches[0];
    if (
      !disabled &&
      Math.abs(startCoordinates[0] - clientX) < maxMove &&
      Math.abs(startCoordinates[1] - clientY) < maxMove
    ) {
      event.preventDefault();
      event.stopPropagation();

      assertDefined(this.buttonRef.current).click();
    }
  };

  private readonly onPress = (): void => {
    const { onPress, value } = this.props;

    if (value === undefined) {
      (onPress as ClickHandler)();
    } else {
      (onPress as TypedClickHandler<T>)(value);
    }
  };

  /* eslint-disable-next-line react/no-unused-class-component-methods */
  blur(): void {
    if (this.buttonRef.current) {
      this.buttonRef.current.blur();
    }
  }

  /* eslint-disable-next-line react/no-unused-class-component-methods */
  focus(): void {
    if (this.buttonRef.current) {
      this.buttonRef.current.focus();
    }
  }

  render(): JSX.Element {
    const {
      children,
      onPress, // eslint-disable-line @typescript-eslint/no-unused-vars
      disabled,
      nonAccessibleTitle,
      tabIndex,
      style,
      value, // eslint-disable-line @typescript-eslint/no-unused-vars
      icon,
      rightIcon,
      ...rest
    } = this.props;

    return (
      <StyledButton
        {...rest}
        disabled={disabled}
        onTouchStart={this.onTouchStart}
        onTouchEnd={this.onTouchEnd}
        onClick={this.onPress}
        ref={this.buttonRef}
        tabIndex={tabIndex}
        rightIcon={rightIcon}
        style={style}
        title={nonAccessibleTitle}
        data-variant={rest.variant}
      >
        {icon && resolveIcon(icon)}
        {children && <TextContainer>{children}</TextContainer>}
        {rightIcon && resolveIcon(rightIcon)}
      </StyledButton>
    );
  }
}

export const SegmentedButtonDeprecated = styled.span`
  display: inline-flex;
  white-space: nowrap;

  & > button {
    flex: 1;
    box-shadow: inset 1px 0 0 rgb(190, 190, 190);
  }

  & > button:first-child {
    box-shadow: none;
  }

  & > button:not(:last-child) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  & > button:not(:first-child) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  & > button:disabled {
    background: #028099;
    color: #fff;
  }
`;

export const LabelButton = styled.label`
  ${buttonStyles}

  &:hover {
    ${(p) => !p.disabled && css(hoverStyles(p))}
  }

  &:active:enabled {
    ${(p) => !p.disabled && css(activeStyles(p))}
  }
`;

/**
 * A disabled button that shows a loading spinner. Swap this button out for a
 * submit button while a form or async action is submitting. Don't forget to add
 * the variant or other styles from the original button.
 *
 * Example usage:
 *  {someMutation.isLoading ? (
 *    <LoadingButton variant="primary">Saving...</LoadingButton>
 *  ) : (
 *    <Button variant="primary" onPress={someMutation.mutate}>Save</Button>
 *  )}
 */
export function LoadingButton(
  props: Omit<ButtonProps, 'disabled' | 'onPress' | 'icon'>
): JSX.Element {
  return <Button {...props} onPress={() => {}} disabled icon="Loading" />;
}
