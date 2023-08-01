import React, { PureComponent } from 'react';

import styled, { css, DefaultTheme, StyledComponent } from 'styled-components';
import { Color, SizeMode, UiTheme } from '@votingworks/types';

import { Icons } from './icons';

const FONT_SIZE_REM = 1;

export const ALL_BUTTON_VARIANTS = [
  'danger',
  'done',
  'edit',
  'next',
  'nextSecondary',
  'previous',
  'previousPrimary',
  'primary',
  'regular',
  'secondary',
  'settings',
  'warning',
] as const;

export type ButtonVariant = typeof ALL_BUTTON_VARIANTS[number];

type ClickHandler = () => void;
type TypedClickHandler<T> = (value: T) => void;

export interface StyledButtonProps {
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  id?: string;
  role?: string;
  variant?: ButtonVariant;

  /** @deprecated Place the button within a flex or grid container instead. */
  readonly fullWidth?: boolean;

  /** @deprecated Incompatible with new VVSG size themes */
  readonly large?: boolean;

  /** @deprecated Incompatible with new VVSG size themes */
  readonly small?: boolean;
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

/** @deprecated Use {@link ButtonProps} instead. */
export type ButtonInterface = Pick<
  ButtonProps,
  'fullWidth' | 'large' | 'small' | 'variant'
>;

interface VariantConfig {
  color: keyof UiTheme['colors'];
  icon?: React.ComponentType;
  isSolidColor?: boolean;
}

const variantConfigs: Record<ButtonVariant, VariantConfig> = {
  danger: { color: 'accentDanger', icon: Icons.Danger, isSolidColor: true },
  done: { color: 'accentPrimary', icon: Icons.Done, isSolidColor: true },
  edit: { color: 'foreground', icon: Icons.Edit },
  next: { color: 'accentPrimary', icon: Icons.Next, isSolidColor: true },
  nextSecondary: { color: 'foreground', icon: Icons.Next, isSolidColor: false },
  previous: { color: 'foreground', icon: Icons.Previous },
  previousPrimary: {
    color: 'accentPrimary',
    icon: Icons.Previous,
    isSolidColor: true,
  },
  primary: { color: 'accentPrimary', isSolidColor: true },
  regular: { color: 'foreground' },
  secondary: { color: 'accentSecondary', isSolidColor: true },
  settings: { color: 'foreground', icon: Icons.Settings },
  warning: { color: 'accentWarning', icon: Icons.Warning, isSolidColor: true },
};

function getVariantConfig(p: StyledButtonProps): VariantConfig {
  return variantConfigs[p.variant || 'regular'];
}

type ThemedStyledButtonProps = StyledButtonProps & { theme: UiTheme };

function getVariantColor(p: ThemedStyledButtonProps): Color | undefined {
  const colorKey = getVariantConfig(p).color;
  return p.theme.colors[colorKey];
}

function getBackgroundColor(p: ThemedStyledButtonProps): Color | undefined {
  if (p.disabled) {
    if (p.theme.colorMode === 'legacy') {
      return Color.LEGACY_BUTTON_BACKGROUND;
    }

    return p.theme.colors.background;
  }

  if (getVariantConfig(p).isSolidColor) {
    return getVariantColor(p);
  }

  if (p.theme.colorMode === 'legacy') {
    return Color.LEGACY_BUTTON_BACKGROUND;
  }

  return p.theme.colors.background;
}

function getForegroundColor(p: ThemedStyledButtonProps): Color | undefined {
  if (p.disabled) {
    return p.theme.colors.foregroundDisabled;
  }

  const variantConfig = variantConfigs[p.variant || 'regular'];
  if (variantConfig.isSolidColor) {
    if (p.theme.colorMode === 'legacy') {
      return Color.WHITE;
    }

    return p.theme.colors.background;
  }

  if (p.theme.colorMode === 'legacy') {
    return Color.BLACK;
  }

  return getVariantColor(p);
}

function getBorderColor(p: ThemedStyledButtonProps): Color | undefined {
  const variantConfig = variantConfigs[p.variant || 'regular'];
  if (variantConfig.isSolidColor) {
    return getBackgroundColor(p);
  }

  return getForegroundColor(p);
}

const paddingStyles: Record<SizeMode, string | undefined> = {
  s: '0.5em 0.6em',
  m: '0.5em 0.6em',
  l: '0.4em 0.5em',
  xl: '0.3em 0.4em',
  legacy: undefined, // Already defined in base styles.
};

function getPadding(p: StyledButtonProps & { theme: DefaultTheme }) {
  return paddingStyles[p.theme.sizeMode];
}

const sizeThemeStyles = css<StyledButtonProps>`
  align-items: center;
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
  width: auto;
  min-height: ${(p) => p.theme.sizes.minTouchAreaSizePx}px;
  vertical-align: middle;
`;

const colorThemeStyles = css<StyledButtonProps>`
  background: ${getBackgroundColor};
  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid ${getBorderColor};
  border-radius: 0.25rem;
  box-shadow: none;
  color: ${getForegroundColor};
  cursor: pointer;
  text-shadow: none;
  transition: 100ms ease-in;
  transition-property: background, border, box-shadow, color;

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

// TODO: Remove legacy styles and consolidate once all clients have been moved
// over to VVSG themes.
export const buttonStyles = css<StyledButtonProps>`
  display: inline-block;
  border: none;
  border-radius: 0.25em;
  box-sizing: border-box;
  background: ${getBackgroundColor};
  width: ${({ fullWidth = false }) => (fullWidth ? '100%' : undefined)};
  padding: ${({ large = false, small = false }) =>
    small ? '0.35em 0.5em' : large ? '1em 1.75em' : '0.75em 1em'};
  text-align: center;
  line-height: 1.25;
  color: ${getForegroundColor};
  font-size: ${({ large = false }) => (large ? '1.25em' : undefined)};
  touch-action: manipulation;

  &:hover,
  &:active {
    outline: none;
  }

  /* Conditional themed styles: */
  ${(p) => p.theme.sizeMode !== 'legacy' && sizeThemeStyles}
  ${(p) => p.theme.colorMode !== 'legacy' && colorThemeStyles}
`;

export const DecoyButton = styled.div`
  ${buttonStyles}
`;

const StyledButton = styled('button').attrs(({ type = 'button' }) => ({
  type,
}))`
  ${buttonStyles}
`;

const IconContainer = styled.span`
  display: ${(p) =>
    p.theme.colorMode === 'legacy' || p.theme.sizeMode === 'legacy'
      ? 'none'
      : 'inline-block'};
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
      ...rest
    } = this.props;

    const Icon = variantConfigs[variant || 'regular'].icon;

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
        {Icon && (
          <IconContainer>
            <Icon />
          </IconContainer>
        )}
        {children && <TextContainer>{children}</TextContainer>}
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
    color: #ffffff;
  }
`;

export const LabelButton = styled.label`
  ${buttonStyles}
`;
