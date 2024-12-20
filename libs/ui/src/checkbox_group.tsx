import styled from 'styled-components';
import { CheckboxButton } from './checkbox_button';

interface Option {
  label: string;
  value: string;
}

export interface CheckboxGroupProps {
  /**
   * Required for a11y - use {@link hideLabel} to visually hide the label, while
   * still allowing it to be assigned to the control for screen readers.
   */
  label: string;
  hideLabel?: boolean;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  direction?: 'row' | 'column';
}

const LabelContainer = styled.legend`
  display: block;
  margin-bottom: 0.5rem;
  font-size: ${(p) => p.theme.sizeMode !== 'desktop' && '0.75rem'};
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

const OptionsContainer = styled.div<{ direction: 'row' | 'column' }>`
  display: flex;
  flex-direction: ${(p) => p.direction};
  gap: 0.25rem;
`;

/**
 * A group of labeled checkboxes that allow the user to select multiple options.
 */
export function CheckboxGroup({
  label,
  hideLabel,
  options,
  value,
  onChange,
  disabled = false,
  direction = 'column',
}: CheckboxGroupProps): JSX.Element {
  return (
    <fieldset aria-label={label}>
      {!hideLabel && <LabelContainer aria-hidden>{label}</LabelContainer>}
      <OptionsContainer direction={direction}>
        {options.map((option) => {
          const isSelected = value.includes(option.value);
          return (
            <CheckboxButton
              key={option.label}
              label={option.label}
              disabled={disabled}
              isChecked={isSelected}
              onChange={() => {
                if (isSelected) {
                  onChange(value.filter((v) => v !== option.value));
                } else {
                  onChange([...value, option.value]);
                }
              }}
            />
          );
        })}
      </OptionsContainer>
    </fieldset>
  );
}
