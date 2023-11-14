import styled from 'styled-components';

import { Caption } from './typography';
import { Button } from './button';

/** Option ID type for the RadioGroup component. */
type RadioGroupOptionId = string | number;

/** Data schema for a single option in the RadioGroup component. */
interface RadioGroupOption<T extends RadioGroupOptionId> {
  ariaLabel?: string;
  id: T;
  label: React.ReactNode;
}
/** Common props for subcomponents of a single RadioGroup option. */
export type OptionProps<T extends RadioGroupOptionId> = RadioGroupOption<T> & {
  onSelect: (id: T) => void;
  selected: boolean;
  disabled?: boolean;
};

const StyledButton = styled(Button)`
  padding-left: 0.5rem;
  border-color: ${(p) => p.theme.colors.outline};
  border-width: ${(p) =>
    p.theme.sizeMode === 'desktop'
      ? p.theme.sizes.bordersRem.thin
      : p.theme.sizes.bordersRem.hairline}rem;
  flex-wrap: nowrap;
  justify-content: start;

  /* Increase contrast between selected/unselected options when disabled by
   * removing the darkening filter for unselected options. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
`;

export function RadioButton<T extends RadioGroupOptionId>(
  props: OptionProps<T>
): JSX.Element {
  const { ariaLabel, disabled, id, label, onSelect, selected } = props;

  return (
    <StyledButton
      aria-label={ariaLabel}
      aria-checked={selected}
      disabled={disabled}
      color={selected ? 'primary' : 'neutral'}
      fill={selected ? 'tinted' : 'outlined'}
      icon={selected ? 'CircleDot' : 'Circle'}
      tabIndex={0}
      role="radio"
      onPress={() => onSelect(id)}
    >
      {label}
    </StyledButton>
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
          />
        ))}
      </OptionsContainer>
    </OuterContainer>
  );
}
