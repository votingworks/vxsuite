import { Icons } from '@votingworks/ui';
import styled from 'styled-components';

interface Option<V> {
  label: string;
  value: V;
}

interface RadioGroupProps<V> {
  options: Array<Option<V>>;
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
}

const Container = styled.span`
  display: inline-flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const Option = styled.label<{ isSelected: boolean; disabled: boolean }>`
  padding: 0.5rem 1rem;
  background: ${(p) =>
    p.isSelected
      ? p.disabled
        ? p.theme.colors.foregroundDisabled
        : p.theme.colors.accentPrimary
      : 'none'};
  color: ${(p) => (p.isSelected ? 'white' : 'currentColor')};
  border-radius: 0.25rem;
  cursor: ${(p) => (p.disabled ? 'default' : 'pointer')};

  input {
    &:checked {
      background: ${(p) => p.theme.colors.accentPrimary};
    }
  }
`;

export function RadioGroup<V extends number | string>({
  options,
  value,
  onChange,
  disabled = false,
}: RadioGroupProps<V>): JSX.Element {
  return (
    <Container role="radiogroup">
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <Option
            key={option.label}
            isSelected={isSelected}
            disabled={disabled}
          >
            {isSelected ? <Icons.CircleDot /> : <Icons.Circle />}
            <input
              style={{ visibility: 'hidden' }}
              type="radio"
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              disabled={disabled}
            />
            <span>{option.label}</span>
          </Option>
        );
      })}
    </Container>
  );
}
