import { useCallback } from 'react';
import styled, { css } from 'styled-components';

import { OptionProps, RadioGroupOptionId } from './types';
import { Icons } from '../icons';

const RADIO_SIZE_REM = 0.9;

interface ContainerProps {
  disabled: boolean;
  selected: boolean;
}

const disabledContainerStyles = css`
  border: none; /* We replace the radio with a not-allowed icon when disabled. */
`;

const Container = styled.span<ContainerProps>`
  align-items: center;
  border-radius: 50%;
  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid currentColor;
  display: flex;
  flex-shrink: 0;
  font-size: ${RADIO_SIZE_REM}rem;
  height: ${RADIO_SIZE_REM}rem;
  justify-content: center;
  position: relative;
  transition: border 100ms ease-in;
  width: ${RADIO_SIZE_REM}rem;

  ${(p) => p.disabled && disabledContainerStyles}
`;

interface MarkProps {
  selected: boolean;
}

const SelectedRadioMark = styled.span<MarkProps>`
  background: currentColor;
  border-radius: 50%;
  display: block;
  flex-shrink: 0;
  height: 60%;
  opacity: ${(p) => (p.selected ? 1 : 0)};
  transition: opacity 100ms ease-in;
  width: 60%;
`;

// Rendered as a transparent overlay above the custom radio to retain browser
// native radio button interaction.
const RadioInput = styled.input.attrs({ type: 'radio' })`
  cursor: ${(p) => (p.disabled ? 'not-allowed' : 'pointer')};
  height: 100%;
  left: 0;
  opacity: 0;
  position: absolute;
  top: 0;
  width: 100%;
`;

/** Custom-styled radio input, used in the RadioGroup component. */
export function Radio<T extends RadioGroupOptionId>(
  props: OptionProps<T>
): JSX.Element {
  const { disabled, groupLabel, id, onSelect, selected } = props;

  const boundOnSelect = useCallback(() => onSelect(id), [id, onSelect]);

  return (
    <Container disabled={!!disabled} selected={selected}>
      {disabled ? (
        <Icons.Disabled />
      ) : (
        <SelectedRadioMark selected={selected} />
      )}
      <RadioInput
        checked={selected}
        disabled={disabled}
        name={groupLabel}
        onChange={boundOnSelect}
      />
    </Container>
  );
}
