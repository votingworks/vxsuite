/* stylelint-disable order/properties-order */
import React from 'react';
import styled from 'styled-components';

import { Caption } from '../typography';
import { RadioButton } from './radio_button';
import { RadioGroupOption, RadioGroupOptionId } from './types';

// eslint-disable-next-line vx/gts-no-import-export-type
export type { RadioGroupOption, RadioGroupOptionId };

/** Props for {@link RadioGroup}. */
export interface RadioGroupProps<T extends RadioGroupOptionId> {
  hideLabel?: boolean;
  /**
   * Required for a11y - use {@link hideLabel} to visually hide the label, while
   * still allowing it to be assigned to the control for screen readers.
   */
  label: string;
  onChange: (newId: T) => void;
  options: ReadonlyArray<RadioGroupOption<T>>;
  selectedOptionId?: T;
}

const OuterContainer = styled.fieldset.attrs({ role: 'radiogroup' })`
  display: inline-block;
`;

const LabelContainer = styled.legend`
  display: block;
  margin-bottom: 0.5rem;
`;

const OptionsContainer = styled.span`
  border-radius: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 0.35rem;
`;

/**
 * Renders a theme-compatible and touch-friendly radio button input group with
 * browser-native semantic elements.
 */
export function RadioGroup<T extends RadioGroupOptionId>(
  props: RadioGroupProps<T>
): JSX.Element {
  const { hideLabel, label, onChange, options, selectedOptionId } = props;

  return (
    <OuterContainer aria-label={label}>
      {!hideLabel && (
        <LabelContainer aria-hidden>
          <Caption weight="semiBold">{label}</Caption>
        </LabelContainer>
      )}
      <OptionsContainer>
        {options.map((o) => (
          <RadioButton
            {...o}
            groupLabel={label}
            key={o.id}
            onSelect={onChange}
            selected={o.id === selectedOptionId}
          />
        ))}
      </OptionsContainer>
    </OuterContainer>
  );
}
