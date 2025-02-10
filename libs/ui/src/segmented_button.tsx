import React from 'react';
import styled, { css, useTheme } from 'styled-components';

import { Button, ButtonProps } from './button';

/** Props for {@link SegmentedButton}. */
export interface SegmentedButtonProps<T extends SegmentedButtonOptionId> {
  disabled?: boolean;
  hideLabel?: boolean;
  /**
   * Required for a11y - use {@link hideLabel} to visually hide the label, while
   * still allowing it to be assigned to the control for screen readers.
   */
  label: string;
  onChange: (newId: T) => void;
  options: ReadonlyArray<SegmentedButtonOption<T>>;
  selectedOptionId?: T;
  vertical?: boolean;
}

/** Option schema for {@link SegmentedButton}. */
export interface SegmentedButtonOption<
  T extends SegmentedButtonOptionId = string,
> {
  id: T;
  label: React.ReactNode;
  ariaLabel?: string;
  icon?: ButtonProps['icon'];
}

/** Option ID type for {@link SegmentedButton}. */
export type SegmentedButtonOptionId = string | number;

const OuterContainer = styled.span`
  display: inline-block;
`;

const LabelContainer = styled.div`
  margin-bottom: 0.5rem;
  font-size: ${(p) => p.theme.sizeMode !== 'desktop' && '0.75rem'};
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

interface OptionsContainerProps {
  isVertical?: boolean;
  disabled?: boolean;
}

const desktopStyles = css<OptionsContainerProps>`
  button {
    font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  }

  &[disabled] {
    background-color: ${(p) => p.theme.colors.container};
    border-style: dashed;

    button {
      border-color: transparent;
    }
  }
`;

const OptionsContainer = styled.span<OptionsContainerProps>`
  background: ${(p) => p.theme.colors.containerLow};
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: inline-flex;
  flex-direction: ${(p) => (p.isVertical ? 'column' : 'row')};
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  padding: ${(p) => (p.theme.sizeMode === 'desktop' ? undefined : '0.75rem')};

  ${(p) => p.theme.colorMode === 'desktop' && desktopStyles}
`;

type OptionButtonProps<T extends SegmentedButtonOptionId> = ButtonProps<T> & {
  selected: boolean;
};

const optionButtonTouchStyles = css<OptionButtonProps<SegmentedButtonOptionId>>`
  &[disabled] {
    background-color: ${(p) =>
      p.selected ? p.theme.colors.primary : undefined};
    color: ${(p) => (p.selected ? p.theme.colors.onPrimary : undefined)};
  }
`;

// TODO(kofi): Worth extracting a shared OptionButton or ToggleButton for cases
// like this (e.g. segmented button, checkbox button, radio button, etc).
const OptionButton = styled(Button)<OptionButtonProps<SegmentedButtonOptionId>>`
  ${(p) => p.theme.colorMode !== 'desktop' && optionButtonTouchStyles}
` as unknown as new <T extends SegmentedButtonOptionId>() => React.Component<
  OptionButtonProps<T>
>;

/**
 * Renders a list of options as labelled buttons, where only one option can be
 * selected at a time.
 *
 * Once an option has been selected, it cannot be de-selected unless a different
 * option is selected, similar to the behavior of radio buttons.
 *
 * This is not a true segmented button, since the buttons have gaps between them
 * in order to satisfy requirements from VVSG 2.0 Ch 7.2-I – Touch area size.
 */
export function SegmentedButton<T extends SegmentedButtonOptionId>(
  props: SegmentedButtonProps<T>
): JSX.Element {
  const theme = useTheme();
  const {
    disabled,
    hideLabel,
    label,
    onChange,
    options,
    selectedOptionId,
    vertical,
  } = props;

  return (
    <OuterContainer>
      {!hideLabel && <LabelContainer aria-hidden>{label}</LabelContainer>}
      <OptionsContainer
        disabled={disabled}
        aria-disabled={disabled}
        aria-label={label}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        isVertical={vertical}
        role="listbox"
      >
        {options.map((o) => {
          const isSelected = o.id === selectedOptionId;
          return (
            <OptionButton
              aria-label={o.ariaLabel}
              aria-selected={o.id === selectedOptionId}
              disabled={disabled}
              key={o.id}
              onPress={onChange}
              role="option"
              selected={o.id === selectedOptionId}
              value={o.id}
              variant={isSelected ? 'primary' : 'neutral'}
              fill={
                theme.colorMode === 'desktop'
                  ? isSelected
                    ? 'tinted'
                    : 'transparent'
                  : undefined
              }
              icon={o.icon}
            >
              {o.label}
            </OptionButton>
          );
        })}
      </OptionsContainer>
    </OuterContainer>
  );
}
