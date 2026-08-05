import { css } from 'styled-components';
import { styled } from './styled.js';

import { Icons } from './icons.js';

export interface CheckboxProps {
  checked?: boolean;
  filled?: boolean;
}

interface StyleProps {
  checked: boolean;
  filled: boolean;
}

// @coverage-defer
const filledStyles = css<StyleProps>`
  background-color: ${(p) => p.theme.colors.primary};
  color: ${(p) => p.theme.colors.onPrimary};
  border-color: ${(p) => p.theme.colors.primary};
`;

const selectedChoiceStyles = css<StyleProps>`
  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid currentColor;
`;

// @coverage-defer
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
  ${(p) => p.filled && filledStyles};

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
