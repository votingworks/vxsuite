import { Color } from '@votingworks/types';
import { Icons } from '@votingworks/ui';
import styled from 'styled-components';

interface Option {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

const Container = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const Option = styled.label<{ isSelected: boolean; disabled: boolean }>`
  padding: 0.5rem 1rem;
  background: ${(p) =>
    p.isSelected
      ? p.theme.colors.accentPrimary
      : Color.LEGACY_BUTTON_BACKGROUND};
  color: ${(p) => (p.isSelected ? 'white' : 'currentColor')};
  border-radius: 0.25rem;
  cursor: ${(p) => (p.disabled ? 'default' : 'pointer')};
  input {
    &:checked {
      background: ${(p) => p.theme.colors.accentPrimary};
    }
  }
`;

export function MultiSelect({
  options,
  value,
  onChange,
  disabled = false,
}: MultiSelectProps): JSX.Element {
  return (
    <Container>
      {options.map((option) => {
        const isSelected = value.includes(option.value);
        return (
          <Option
            key={option.label}
            isSelected={isSelected}
            disabled={disabled}
          >
            {isSelected ? <Icons.Checkbox /> : <Icons.Square />}
            <input
              style={{ visibility: 'hidden' }}
              type="checkbox"
              checked={isSelected}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...value, option.value]);
                } else {
                  onChange(value.filter((v) => v !== option.value));
                }
              }}
            />
            <span>{option.label}</span>
          </Option>
        );
      })}
    </Container>
  );
}
