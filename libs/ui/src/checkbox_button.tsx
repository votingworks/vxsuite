import styled from 'styled-components';
import { Button } from './button';

export interface CheckboxButtonProps {
  label: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
  disabled?: boolean;
}

const StyledButton = styled(Button)`
  background-color: ${(p) =>
    p.color === 'neutral' && p.theme.colors.containerLow};
  border-color: ${(p) => p.theme.colors.outline};
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;

  /* Increase contrast between checked/unchecked when disabled by
   * removing the darkening filter for unchecked buttons. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
`;

export function CheckboxButton({
  label,
  isChecked,
  onChange,
  disabled,
}: CheckboxButtonProps): JSX.Element {
  return (
    <StyledButton
      aria-checked={isChecked}
      disabled={disabled}
      role="checkbox"
      fill={isChecked ? 'tinted' : 'outlined'}
      color={isChecked ? 'primary' : 'neutral'}
      onPress={() => onChange(!isChecked)}
      icon={isChecked ? 'Checkbox' : 'Square'}
    >
      {label}
    </StyledButton>
  );
}
