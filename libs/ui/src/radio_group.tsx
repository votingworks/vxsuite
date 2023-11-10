import styled from 'styled-components';
import { Caption } from './typography';
import { Button } from './button';

/** Option value type for the RadioGroup component. */
type RadioGroupValue = string | number;

/** Data schema for a single option in the RadioGroup component. */
interface RadioGroupOption<T extends RadioGroupValue> {
  value: T;
  label: React.ReactNode;
}

/** Props for {@link RadioGroup}. */
export interface RadioGroupProps<T extends RadioGroupValue> {
  disabled?: boolean;
  hideLabel?: boolean;
  inverse?: boolean;
  /**
   * Required for a11y - use {@link hideLabel} to visually hide the label, while
   * still allowing it to be assigned to the control for screen readers.
   */
  label: string;
  /** @default 1 */
  numColumns?: number;
  onChange: (newId: T) => void;
  options: ReadonlyArray<RadioGroupOption<T>>;
  value?: T;
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

const Option = styled.span`
  position: relative;

  /* Apply focus outline to the button when the radio input is focused. */
  input:not(:active):focus + button {
    outline: var(--focus-outline);
  }
`;

const StyledButton = styled(Button)`
  background-color: ${(p) =>
    p.color === 'neutral' && p.theme.colors.containerLow};
  border-color: ${(p) => p.theme.colors.outline};
  border-width: ${(p) =>
    p.theme.sizeMode === 'desktop'
      ? p.theme.sizes.bordersRem.thin
      : p.theme.sizes.bordersRem.hairline}rem;
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
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
  cursor: pointer;
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  opacity: 0;

  &[disabled] {
    cursor: not-allowed;
  }
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
export function RadioGroup<T extends RadioGroupValue>(
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
    value,
  } = props;

  return (
    <OuterContainer aria-label={label}>
      {!hideLabel && (
        <LabelContainer aria-hidden>
          <Caption weight="semiBold">{label}</Caption>
        </LabelContainer>
      )}
      <OptionsContainer numColumns={numColumns || 1}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Option key={option.value}>
              <RadioInput
                aria-labelledby={`${option.value}-label`}
                checked={isSelected}
                disabled={disabled}
                name={label}
                onChange={(e) => {
                  onChange(option.value);
                  // If clicked, blur to remove focus outline. If triggered via
                  // other input (e.g. keyboard), keep focus.
                  /* istanbul ignore next */
                  if (
                    'pointerType' in e.nativeEvent &&
                    e.nativeEvent['pointerType'] === 'mouse'
                  ) {
                    e.currentTarget.blur();
                  }
                }}
              />
              <StyledButton
                id={`${option.value}-label`}
                disabled={disabled}
                color={
                  inverse
                    ? 'inverseNeutral'
                    : isSelected
                    ? 'primary'
                    : 'neutral'
                }
                fill={isSelected ? 'tinted' : 'outlined'}
                icon={isSelected ? 'CircleDot' : 'Circle'}
                tabIndex={-1}
                // Interaction will be handled by the radio input
                onPress={() => {}}
              >
                {option.label}
              </StyledButton>
            </Option>
          );
        })}
      </OptionsContainer>
    </OuterContainer>
  );
}
