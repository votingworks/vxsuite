import { Button } from '@votingworks/ui';
import styled from 'styled-components';

interface Option<V extends string> {
  value: V;
  label: string;
}

const ControlContainer = styled.div<{ vertical?: boolean }>`
  display: inline-flex;
  flex-direction: ${(p) => (p.vertical ? 'column' : 'row')};
  border-radius: 0.25rem;
  background: ${(p) => p.theme.colors.background};
`;

const ControlOption = styled(Button)<{
  isSelected: boolean;
  vertical?: boolean;
}>`
  background: ${(p) =>
    p.isSelected
      ? p.disabled
        ? p.theme.colors.foregroundDisabled
        : p.theme.colors.accentPrimary
      : 'none'};
  color: ${(p) => (p.isSelected ? 'white' : 'currentColor')};
  text-align: ${(p) => (p.vertical ? 'left' : 'center')};

  &:disabled {
    cursor: default;
  }
`;

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  disabled,
  vertical,
}: {
  options: Array<Option<V>>;
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  vertical?: boolean;
}): JSX.Element {
  return (
    <ControlContainer vertical={vertical} role="radiogroup">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <ControlOption
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            isSelected={isSelected}
            vertical={vertical}
            role="radio"
            aria-label={option.label}
            aria-checked={isSelected}
          >
            {option.label}
          </ControlOption>
        );
      })}
    </ControlContainer>
  );
}
