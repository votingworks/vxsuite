import styled from 'styled-components';
import { Button } from './button';
import { Caption } from './typography';

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
}

const Container = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const LabelContainer = styled.legend`
  display: block;
  margin-bottom: 0.5rem;
`;

const Option = styled(Button)`
  border-color: ${(p) => p.theme.colors.outline};
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;

  /* Increase contrast between selected/unselected options when disabled by
   * removing the darkening filter for unselected options. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
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
}: CheckboxGroupProps): JSX.Element {
  return (
    <Container aria-label={label}>
      {!hideLabel && (
        <LabelContainer aria-hidden>
          <Caption weight="semiBold">{label}</Caption>
        </LabelContainer>
      )}
      {options.map((option) => {
        const isSelected = value.includes(option.value);
        return (
          <Option
            key={option.label}
            aria-checked={isSelected}
            disabled={disabled}
            role="checkbox"
            fill={isSelected ? 'tinted' : 'outlined'}
            color={isSelected ? 'primary' : 'neutral'}
            onPress={() => {
              if (isSelected) {
                onChange(value.filter((v) => v !== option.value));
              } else {
                onChange([...value, option.value]);
              }
            }}
            icon={isSelected ? 'Checkbox' : 'Square'}
          >
            {option.label}
          </Option>
        );
      })}
    </Container>
  );
}
