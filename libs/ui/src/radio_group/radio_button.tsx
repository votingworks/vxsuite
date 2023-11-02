import styled from 'styled-components';

import { ButtonProps, buttonStyles } from '../button';
import { Radio } from './radio';
import { OptionProps, RadioGroupOptionId } from './types';

type OptionContainerProps = Pick<ButtonProps, 'disabled' | 'color' | 'fill'>;

const Container = styled.label<OptionContainerProps>`
  ${buttonStyles}

  align-items: center;
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border-width: ${(p) => p.theme.sizes.bordersRem.hairline}rem;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.25rem;
  justify-content: start;
  min-height: 2.5rem;
  padding: 0.25rem;
  text-align: left;

  &[disabled] {
    border-width: ${(p) => p.theme.sizes.bordersRem.hairline}rem;
  }
`;

const Label = styled.span`
  display: block;
  flex-grow: 1;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
`;

export function RadioButton<T extends RadioGroupOptionId>(
  props: OptionProps<T>
): JSX.Element {
  const { ariaLabel, disabled, label, selected } = props;

  return (
    <Container
      aria-label={ariaLabel}
      disabled={disabled}
      color={selected ? 'primary' : 'neutral'}
      fill={selected ? 'filled' : 'outlined'}
    >
      <Radio {...props} />
      <Label>{label}</Label>
    </Container>
  );
}
