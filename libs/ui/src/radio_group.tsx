import styled from 'styled-components';
import React from 'react';
import { Caption } from './typography';
import { Button } from './button';

/** Option ID type for the RadioGroup component. */
type RadioGroupOptionId = string | number;

/** Data schema for a single option in the RadioGroup component. */
interface RadioGroupOption<T extends RadioGroupOptionId> {
  id: T;
  label: React.ReactNode;
  inverse?: boolean;
}
/** Common props for subcomponents of a single RadioGroup option. */
export type OptionProps<T extends RadioGroupOptionId> = RadioGroupOption<T> & {
  onSelect: (id: T) => void;
  selected: boolean;
  disabled?: boolean;
};

const RadioContainer = styled.span`
  position: relative;

  /* Apply focus outline to the button when the radio input is focused. */
  input:focus + button {
    outline: var(--focus-outline);
  }
`;

const StyledButton = styled(Button)`
  padding-left: 0.5rem;
  border-color: ${(p) => p.theme.colors.outline};
  border-width: ${(p) =>
    p.theme.sizeMode === 'desktop'
      ? p.theme.sizes.bordersRem.thin
      : p.theme.sizes.bordersRem.hairline}rem;
  flex-wrap: nowrap;
  justify-content: start;
  text-align: left;
  width: 100%;

  /* Increase contrast between selected/unselected options when disabled by
   * removing the darkening filter for unselected options. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
`;

// Use an invisible radio input to handle the user interaction and checked
// state. This ensures that we maintain the recommended a11y interaction pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/radio/).
const RadioInput = styled.input.attrs({ type: 'radio' })`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  opacity: 0;
`;

export function RadioButton<T extends RadioGroupOptionId>(
  props: OptionProps<T>
): JSX.Element {
  const { disabled, id, inverse, label, onSelect, selected } = props;

  return (
    <RadioContainer>
      <RadioInput
        aria-labelledby={`${id}-label`}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(id)}
      />
      <StyledButton
        id={`${id}-label`}
        disabled={disabled}
        color={inverse ? 'inverseNeutral' : selected ? 'primary' : 'neutral'}
        fill={selected ? 'tinted' : 'outlined'}
        icon={selected ? 'CircleDot' : 'Circle'}
        tabIndex={-1}
        // Interaction will be handled by the radio input
        onPress={() => {}}
      >
        {label}
      </StyledButton>
    </RadioContainer>
  );
}

/** Props for {@link RadioGroup}. */
export interface RadioGroupProps<T extends RadioGroupOptionId> {
  disabled?: boolean;
  hideLabel?: boolean;
  /**
   * Required for a11y - use {@link hideLabel} to visually hide the label, while
   * still allowing it to be assigned to the control for screen readers.
   */
  label: string;
  /** @default 1 */
  numColumns?: number;
  onChange: (newId: T) => void;
  options: ReadonlyArray<RadioGroupOption<T>>;
  selectedOptionId?: T;
  inverse?: boolean;
}

const OuterContainer = styled.fieldset.attrs({ role: 'radiogroup' })`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const LabelContainer = styled.legend`
  display: block;
  margin-bottom: 0.5rem;
`;

interface OptionsContainerProps {
  numColumns: number;
}

const OptionsContainer = styled.span<OptionsContainerProps>`
  align-items: stretch;
  display: grid;
  grid-gap: 0.5rem;
  grid-template-columns: ${(p) =>
    Array.from({ length: p.numColumns }).fill('1fr').join(' ')};
  height: 100%;
`;

/**
 * Renders a theme-compatible and touch-friendly radio button input group.
 */
export function RadioGroup<T extends RadioGroupOptionId>(
  props: RadioGroupProps<T>
): JSX.Element {
  const {
    disabled,
    hideLabel,
    inverse,
    label,
    numColumns,
    onChange,
    options,
    selectedOptionId,
  } = props;

  return (
    <OuterContainer aria-label={label}>
      {!hideLabel && (
        <LabelContainer aria-hidden>
          <Caption weight="semiBold">{label}</Caption>
        </LabelContainer>
      )}
      <OptionsContainer numColumns={numColumns || 1}>
        {options.map((o) => (
          <RadioButton
            {...o}
            key={o.id}
            onSelect={onChange}
            selected={o.id === selectedOptionId}
            disabled={disabled}
            inverse={inverse}
          />
        ))}
      </OptionsContainer>
    </OuterContainer>
  );
}
