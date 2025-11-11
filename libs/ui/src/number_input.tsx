import { safeParseInt } from '@votingworks/types';
import styled from 'styled-components';

// if we used a number input here, there is default browser behavior that
// increases and decreases the value on scroll. instead of preventing this
// with an event handler, we just use a text input
const StyledInput = styled.input.attrs({ type: 'text' })`
  width: 5.5em;
`;

export interface NumberInputProps {
  value: number | '';
  onChange: (newValue: number | '') => void;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  style?: React.CSSProperties;
}

export function NumberInput({
  value,
  onChange,
  id,
  autoFocus,
  disabled,
  inputRef,
  style = {},
}: NumberInputProps): JSX.Element {
  return (
    <StyledInput
      id={id}
      value={value}
      onChange={(event) => {
        const inputValue = event.currentTarget.value;
        if (inputValue === '') {
          onChange('');
          return;
        }

        const parsedInput = safeParseInt(inputValue);
        if (parsedInput.isOk() && parsedInput.ok() >= 0) {
          onChange(parsedInput.ok());
        }
      }}
      disabled={disabled}
      autoFocus={autoFocus}
      style={style}
      ref={inputRef}
    />
  );
}
