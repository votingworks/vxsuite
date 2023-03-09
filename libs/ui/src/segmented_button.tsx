/* stylelint-disable order/properties-order, value-keyword-case, order/order */

// HACK: sizes here are specified in `em` instead of the standard `rem` to
// support size overrides in storybook - this won't affect regular usage in apps
// and can only be leveraged with an !important font-size setting in a parent
// component, since we set the base font-size here to 1rem.

import React from 'react';
import styled, { css } from 'styled-components';

import { buttonStyles, ButtonVariant } from './button';

export interface SegmentedButtonProps<T extends SegmentedButtonOptionId> {
  onChange: (newId: T) => void;
  options: ReadonlyArray<SegmentedButtonOption<T>>;
  selectedOptionId?: T;
  vertical?: boolean;
}

export interface SegmentedButtonOption<
  T extends SegmentedButtonOptionId = string
> {
  id: T;
  label: React.ReactNode;
  ariaLabel?: string;
}

export type SegmentedButtonOptionId = string | number;

interface StyledContainerProps {
  isVertical?: boolean;
}

const verticalContainerStyles = css`
  display: flex;
  flex-direction: column;
`;

const StyledContainer = styled.span<StyledContainerProps>`
  display: inline-block;
  font-size: 1rem;
  white-space: nowrap;

  ${(p) => p.isVertical && verticalContainerStyles};
`;

interface OptionButtonProps {
  isSelected?: boolean;
  variant?: ButtonVariant;
  isVertical?: boolean;
}

const selectedOptionStyles = css<OptionButtonProps>`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}em solid
    ${(p) => p.theme.colors.accentPrimary};
  /* border-color: currentColor;
  border-style: solid; */
  box-shadow: inset 0 0 0 0.2em ${(p) => p.theme.colors.accentPrimary};
`;

const unselectedOptionStyles = css<OptionButtonProps>`
  background: none;
`;

const horizontalOptionStyles = css<OptionButtonProps>`
  &:not(:first-child) {
    border-bottom-left-radius: 0;
    border-top-left-radius: 0;
    border-left-color: ${(p) => !p.isSelected && 'transparent'};
    margin-left: -${(p) => p.theme.sizes.bordersRem.hairline}em;
  }

  &:not(:last-child) {
    border-bottom-right-radius: 0;
    border-top-right-radius: 0;
  }
`;

const verticalOptionStyles = css<OptionButtonProps>`
  text-align: left;

  &:not(:first-child) {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    border-top-color: ${(p) => !p.isSelected && 'transparent'};
    margin-top: -${(p) => p.theme.sizes.bordersRem.hairline}em;
  }

  &:not(:last-child) {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
`;

const StyledOption = styled.button<OptionButtonProps>`
  ${buttonStyles}
  border-radius: 0.25em;

  border-width: ${(p) => p.theme.sizes.bordersRem.hairline}em;
  vertical-align: middle;

  &:active {
    ${selectedOptionStyles};
  }

  ${(p) => (p.isVertical ? verticalOptionStyles : horizontalOptionStyles)};
  ${(p) => p.isSelected ? selectedOptionStyles : unselectedOptionStyles};
`;

export function SegmentedButton<T extends SegmentedButtonOptionId>(
  props: SegmentedButtonProps<T>
): JSX.Element {
  const { onChange, options, selectedOptionId, vertical } = props;

  return (
    <StyledContainer
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      isVertical={vertical}
      role="listbox"
    >
      {options.map((o) => (
        <StyledOption
          aria-label={o.ariaLabel}
          // aria-selected={o.id === selectedOptionId}
          key={o.id}
          onClick={() => onChange(o.id)}
          role="option"
          isSelected={o.id === selectedOptionId}
          isVertical={vertical}
          title={o.ariaLabel}
          type="button"
          variant={o.id === selectedOptionId ? 'primary' : 'regular'}
        >
          {o.label}
        </StyledOption>
      ))}
    </StyledContainer>
  );
}
