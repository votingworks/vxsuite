/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import React from 'react';
import styled, { css } from 'styled-components';

import { Color, UiTheme } from '@votingworks/types';

import { buttonStyles, ButtonVariant } from './button';
import { Icons } from './icons';
import { Caption, Font, P } from './typography';

export interface ContestChoiceButtonProps {
  checked?: boolean;
}

type StyleProps = {
  checked: boolean;
  variant?: ButtonVariant;
};

const selectedChoiceStyles = css<StyleProps>`
  border: ${(p) =>
    p.theme.sizes.bordersRem.medium}rem solid currentColor;
`;

const StyledCheckbox = styled(Font)<StyleProps>`
  align-items: center;
  border: ${(p) =>
    p.theme.sizes.bordersRem.hairline}rem solid currentColor;
  border-radius: 0.15em;
  box-sizing: border-box;
  display: inline-flex;
  height: 1.75em;
  justify-content: center;
  width: 1.75em;

  ${(p) => p.checked && selectedChoiceStyles};

  & > svg {
    opacity: ${(p) => (p.checked ? 1 : 0)};
    transition: opacity 100ms ease-in;
  }
`;
const StyledIcon = styled(Icons.Checkmark)<StyleProps>`
  opacity: ${(p) => (p.checked ? 1 : 0)};
  transition: opacity 100ms ease-in;
`;

export function Checkbox(props: ContestChoiceButtonProps): JSX.Element {
  const { checked } = props;

  return (
    <StyledCheckbox
      checked={!!checked}
      weight="bold"
    >
        <StyledIcon checked={!!checked} />
    </StyledCheckbox>
  );
}
