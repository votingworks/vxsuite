import React, { PureComponent } from 'react';

import styled, { css, DefaultTheme, StyledComponent } from 'styled-components';
import { ColorString, SizeMode, UiTheme } from '@votingworks/types';

import { Icons, IconName } from './icons';

const FONT_SIZE_REM = 1;

export const ALL_BUTTON_VARIANTS = [
  'neutral',
  'primary',
  'secondary',
  'danger',
] as const;

export type ButtonVariant = (typeof ALL_BUTTON_VARIANTS)[number];

type ClickHandler = () => void;
type TypedClickHandler<T> = (value: T) => void;

export interface StyledButtonProps {
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  id?: string;
  role?: string;
  variant?: ButtonVariant;
  icon?: IconName | JSX.Element;
  rightIcon?: IconName | JSX.Element;
}

export type ButtonProps<T = undefined> = StyledButtonProps & {
  children?: React.ReactNode;

  /**
   * @deprecated NOTE: Title tooltips are not accessible and should not be used
   * for important information. Consider rendering the text on or near the
   * button.
   */
  nonAccessibleTitle?: string;

  /** @deprecated */
  component?: StyledComponent<'button', DefaultTheme, StyledButtonProps, never>;
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

interface VariantConfig {
  color: keyof UiTheme['colors'];
  isSolidColor?: boolean;
}

const variantConfigs: Record<ButtonVariant, VariantConfig> = {
  neutral: { color: 'foreground' },
  primary: { color: 'accentPrimary', isSolidColor: true },
  secondary: { color: 'accentSecondary', isSolidColor: true },
  danger: { color: 'accentDanger', isSolidColor: true },
};

function getVariantConfig(p: StyledButtonProps): VariantConfig {
  return variantConfigs[p.variant || 'neutral'];
}

type ThemedStyledButtonProps = StyledButtonProps & { theme: UiTheme };

function getVariantColor(p: ThemedStyledButtonProps): ColorString | undefined {
  const colorKey = getVariantConfig(p).color;
  return p.theme.colors[colorKey];
}

function getBackgroundColor(
  p: ThemedStyledButtonProps
): ColorString | undefined {
  if (p.disabled) {
    return p.theme.colors.background;
  }

  if (getVariantConfig(p).isSolidColor) {
    return getVariantColor(p);
  }

  return p.theme.colors.background;
}

function getForegroundColor(
  p: ThemedStyledButtonProps
): ColorString | undefined {
  if (p.disabled) {
    return p.theme.colors.foregroundDisabled;
  }

  const variantConfig = variantConfigs[p.variant || 'neutral'];
  if (variantConfig.isSolidColor) {
    return p.theme.colors.background;
  }

  return getVariantColor(p);
}

function getBorderColor(p: ThemedStyledButtonProps): ColorString | undefined {
  const variantConfig = variantConfigs[p.variant || 'neutral'];
  if (variantConfig.isSolidColor) {
    return getBackgroundColor(p);
  }

  return getForegroundColor(p);
}

const paddingStyles: Record<SizeMode, string | undefined> = {
  desktop: '0.5em 0.6em',
  touchSmall: '0.5em 0.6em',
  touchMedium: '0.5em 0.6em',
  touchLarge: '0.4em 0.5em',
  touchExtraLarge: '0.3em 0.4em',
};

function getPadding(p: StyledButtonProps & { theme: DefaultTheme }) {
  return paddingStyles[p.theme.sizeMode];
}

export const buttonStyles = css<StyledButtonProps>`
  align-items: center;
  background: ${getBackgroundColor};
  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid ${getBorderColor};
  border-radius: 0.25rem;
  box-shadow: none;
  box-sizing: border-box;
  color: ${getForegroundColor};
  cursor: pointer;
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  font-family: inherit;
  font-size: ${FONT_SIZE_REM}rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.bold};
  gap: 0.5rem;
  letter-spacing: ${(p) => p.theme.sizes.letterSpacingEm}em;
  line-height: ${(p) => p.theme.sizes.lineHeight};
  padding: ${getPadding};
  text-align: center;
  text-shadow: none;
  touch-action: manipulation;
  transition: 100ms ease-in;
  transition-property: background, border, box-shadow, color;
  width: auto;
  min-height: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;
  vertical-align: middle;

  &:hover,
  &:active {
    outline: none;
  }

  &:active {
    box-shadow: inset 0 0 0 0.15rem ${getForegroundColor};
  }

  &[disabled] {
    border: ${(p) => p.theme.sizes.bordersRem.medium}rem dashed
      ${(p) => p.theme.colors.foregroundDisabled};
    box-shadow: none;
    cursor: not-allowed;
  }
`;

export const DecoyButton = styled.div`
  ${buttonStyles}
`;

const StyledButton = styled('button').attrs(({ type = 'button' }) => ({
  type,
}))`
  ${buttonStyles}
`;

const TextContainer = styled.span`
  display: inline-block;
  flex-grow: 1;
  flex-shrink: 1;
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

  private readonly onTouchEnd = (event: React.TouchEvent): void => {
    const { disabled } = this.props;
    const { startCoordinates } = this.state;

    const maxMove = 30;
    const { clientX, clientY } = event.changedTouches[0];
    if (
      !disabled &&
      Math.abs(startCoordinates[0] - clientX) < maxMove &&
      Math.abs(startCoordinates[1] - clientY) < maxMove
    ) {
      this.onPress();
      event.preventDefault();
    }
  };

  private readonly onPress = (): void => {
    const { onPress, value } = this.props;

    if (value === undefined) {
      (onPress as ClickHandler)();
    } else {
      onPress(value);
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
      component: Component = StyledButton,
      onPress, // eslint-disable-line @typescript-eslint/no-unused-vars
      disabled,
      nonAccessibleTitle,
      value, // eslint-disable-line @typescript-eslint/no-unused-vars
      variant,
      icon,
      rightIcon,
      ...rest
    } = this.props;

    return (
      <Component
        {...rest}
        disabled={disabled}
        onTouchStart={this.onTouchStart}
        onTouchEnd={this.onTouchEnd}
        onClick={this.onPress}
        ref={this.buttonRef}
        title={nonAccessibleTitle}
        variant={variant}
      >
        {icon && resolveIcon(icon)}
        {children && <TextContainer>{children}</TextContainer>}
        {rightIcon && resolveIcon(rightIcon)}
      </Component>
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
`;
