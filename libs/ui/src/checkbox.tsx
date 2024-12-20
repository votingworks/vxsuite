import styled, { css } from 'styled-components';

import { Icons } from './icons';

export interface CheckboxProps {
  checked?: boolean;
}

interface StyleProps {
  checked: boolean;
}

const selectedChoiceStyles = css<StyleProps>`
  border: ${(p) => p.theme.sizes.bordersRem.medium}rem solid currentColor;
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

  & > * {
    opacity: ${(p) => (p.checked ? 1 : 0)};
    transition: opacity 100ms ease-in;
  }
`;

export function Checkbox(props: CheckboxProps): JSX.Element {
  const { checked } = props;

  return (
    <OuterContainer checked={!!checked}>
      <Icons.Checkmark />
    </OuterContainer>
  );
}
