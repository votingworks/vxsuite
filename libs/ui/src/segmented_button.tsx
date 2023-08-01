import React from 'react';
import styled from 'styled-components';

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
  T extends SegmentedButtonOptionId = string
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
`;

interface OptionsContainerProps {
  isVertical?: boolean;
}

const OptionsContainer = styled.span<OptionsContainerProps>`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.foreground};
  border-radius: 0.25rem;
  display: inline-flex;
  flex-direction: ${(p) => (p.isVertical ? 'column' : 'row')};
  gap: ${(p) => p.theme.sizes.minTouchAreaSeparationPx}px;
  padding: 0.75rem;
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
        aria-disabled={disabled}
        aria-label={label}
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        isVertical={vertical}
        role="listbox"
      >
        {options.map((o) => (
          <Button
            aria-label={o.ariaLabel}
            aria-selected={o.id === selectedOptionId}
            disabled={disabled}
            key={o.id}
            onPress={onChange}
            role="option"
            value={o.id}
            variant={o.id === selectedOptionId ? 'primary' : 'regular'}
          >
            {o.label}
          </Button>
        ))}
      </OptionsContainer>
    </OuterContainer>
  );
}
