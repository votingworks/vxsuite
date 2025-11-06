import { safeParseInt } from '@votingworks/types';
import styled from 'styled-components';

// if we used a number input here, there is default browser behavior that
// increases and decreases the value on scroll. instead of preventing this
// with an event handler, we just use a text input
const StyledInput = styled.input.attrs({ type: 'text' })`
  width: 3rem;
`;

export function NumberInput({
  value,
  onChange,
}: {
  value: number | '';
  onChange: (newValue: number | '') => void;
}): JSX.Element {
  return (
    <StyledInput
      value={value}
      onChange={(event) => {
        const inputValue = event.currentTarget.value.trim();
        if (inputValue === '') {
          onChange('');
          return;
        }

        const parsedInput = safeParseInt(inputValue);
        if (parsedInput.isOk() && parsedInput.ok() >= 0) {
          onChange(parsedInput.ok());
        }
      }}
    />
  );
}
