import styled from 'styled-components';

import { Caption } from '../typography';
import { RadioButton } from './radio_button';
import { RadioGroupOption, RadioGroupOptionId } from './types';

export type { RadioGroupOption, RadioGroupOptionId };

/** Props for {@link RadioGroup}. */
export interface RadioGroupProps<T extends RadioGroupOptionId> {
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

const OPTION_SPACING_REM = 0.5;

const OptionsContainer = styled.span<OptionsContainerProps>`
  align-items: stretch;
  border-radius: 0.25rem;
  display: grid;
  grid-gap: ${OPTION_SPACING_REM}rem;
  grid-template-columns: ${(p) =>
    Array.from({ length: p.numColumns }).fill('1fr').join(' ')};
  height: 100%;
  margin-bottom: 0.35rem;
`;

/**
 * Renders a theme-compatible and touch-friendly radio button input group with
 * browser-native semantic elements.
 */
export function RadioGroup<T extends RadioGroupOptionId>(
  props: RadioGroupProps<T>
): JSX.Element {
  const { hideLabel, label, numColumns, onChange, options, selectedOptionId } =
    props;

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
