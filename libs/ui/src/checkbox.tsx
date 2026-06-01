import styled, { css } from 'styled-components';

import { Icons } from './icons';

export interface CheckboxProps {
  checked?: boolean;
  filled?: boolean;
}

interface StyleProps {
  checked: boolean;
  filled: boolean;
}

const selectedChoiceStyles = css<StyleProps>`
  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid currentColor;
`;

const filledChoiceStyles = css<StyleProps>`
  background-color: ${(p) => p.theme.colors.primary};
  border-color: ${(p) => p.theme.colors.primary};
  color: ${(p) => p.theme.colors.onPrimary};
`;

const OuterContainer = styled.span<StyleProps>`
  align-items: center;
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid currentColor;
  border-radius: 0.15em;
  box-sizing: border-box;
  display: inline-flex;
  height: 1.75em;
  justify-content: center;
  width: 1.75em;

  ${(p) => p.checked && selectedChoiceStyles};
  ${(p) => p.filled && filledChoiceStyles};

  & > * {
    opacity: ${(p) => (p.checked ? 1 : 0)};
    transition: opacity 100ms ease-in;
  }
`;

export function Checkbox(props: CheckboxProps): JSX.Element {
  const { checked, filled } = props;

  return (
    <OuterContainer checked={!!checked} filled={!!filled}>
      <Icons.Checkmark />
    </OuterContainer>
  );
}
