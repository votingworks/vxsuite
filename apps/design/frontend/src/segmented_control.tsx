import { Color } from '@votingworks/types';
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
  background: ${Color.LEGACY_BUTTON_BACKGROUND};
`;

const ControlOption = styled(Button)<{
  isSelected: boolean;
  vertical?: boolean;
}>`
  background: ${(p) =>
    p.isSelected
      ? p.disabled
        ? Color.LEGACY_FOREGROUND_DISABLED
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
    <ControlContainer vertical={vertical}>
      {options.map((option) => (
        <ControlOption
          key={option.value}
          onPress={() => onChange(option.value)}
          disabled={disabled}
          isSelected={option.value === value}
          vertical={vertical}
        >
          {option.label}
        </ControlOption>
      ))}
    </ControlContainer>
  );
}
