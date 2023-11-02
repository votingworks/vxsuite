import React from 'react';
import styled, { css, useTheme } from 'styled-components';

import { Button } from './button';
import { Caption } from './typography';

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
}

/** Option ID type for {@link SegmentedButton}. */
export type SegmentedButtonOptionId = string | number;

const OuterContainer = styled.span`
  display: inline-block;
`;

const LabelContainer = styled(Caption)`
  display: block;
  margin-bottom: 0.125rem;
`;

interface OptionsContainerProps {
  isVertical?: boolean;
  disabled?: boolean;
}

const desktopStyles = css<OptionsContainerProps>`
  button:first-child {
    border-top-left-radius: 0;
    ${(p) =>
      p.isVertical
        ? 'border-top-right-radius: 0;'
        : 'border-bottom-left-radius: 0;'}
  }

  button:last-child {
    ${(p) =>
      p.isVertical
        ? 'border-bottom-left-radius: 0;'
        : 'border-top-right-radius: 0;'}
    border-bottom-right-radius: 0;
  }

  &[disabled] {
    border-style: dashed;

    button {
      border-color: transparent;
    }

    background-color: ${(p) => p.theme.colors.containerLow};
  }
`;

const OptionsContainer = styled.span<OptionsContainerProps>`
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: inline-flex;
  flex-direction: ${(p) => (p.isVertical ? 'column' : 'row')};
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  padding: ${(p) => (p.theme.sizeMode === 'desktop' ? undefined : '0.75rem')};
  overflow: hidden;

  ${(p) => p.theme.colorMode === 'desktop' && desktopStyles}
`;

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
      {!hideLabel && (
        <LabelContainer aria-hidden weight="semiBold">
          {label}
        </LabelContainer>
      )}
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
            <Button
              aria-label={o.ariaLabel}
              aria-selected={o.id === selectedOptionId}
              disabled={disabled}
              key={o.id}
              onPress={onChange}
              role="option"
              value={o.id}
              variant={isSelected ? 'primary' : 'neutral'}
              fill={
                theme.colorMode === 'desktop'
                  ? isSelected
                    ? 'tinted'
                    : 'transparent'
                  : undefined
              }
            >
              {o.label}
            </Button>
          );
        })}
      </OptionsContainer>
    </OuterContainer>
  );
}
