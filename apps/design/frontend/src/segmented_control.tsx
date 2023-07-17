import { Color } from '@votingworks/types';
import { Button } from '@votingworks/ui';
import styled from 'styled-components';

interface Option<V extends string> {
  value: V;
  label: string;
}

const ControlContainer = styled.div`
  display: inline-block;
  border-radius: 0.25rem;
  background: ${Color.LEGACY_BUTTON_BACKGROUND};
`;

const ControlOption = styled(Button)<{ isSelected: boolean }>`
  background: ${(p) =>
    p.isSelected
      ? p.disabled
        ? Color.LEGACY_FOREGROUND_DISABLED
        : p.theme.colors.accentPrimary
      : 'none'};
  color: ${(p) => (p.isSelected ? 'white' : 'currentColor')};
  &:disabled {
    cursor: default;
  }
`;

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<Option<V>>;
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <ControlContainer>
      {options.map((option) => (
        <ControlOption
          key={option.value}
          onPress={() => onChange(option.value)}
          disabled={disabled}
          isSelected={option.value === value}
        >
          {option.label}
        </ControlOption>
      ))}
    </ControlContainer>
  );
}
