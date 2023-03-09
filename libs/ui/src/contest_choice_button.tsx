/* stylelint-disable order/properties-order, value-keyword-case, order/order */
import React, { useCallback } from 'react';
import styled, { css } from 'styled-components';

import { Button, buttonStyles, ButtonVariant } from './button';
import { Checkbox } from './checkbox';
import { Caption, P } from './typography';

export interface ContestChoiceButtonProps<T extends string = string> {
  caption?: React.ReactNode;
  isSelected?: boolean;
  label: React.ReactNode;
  onSelect: (value: T) => void;
  value: T;

  /**
   * @deprecated Added to support pre-existing behaviour WRT the VxMark
   * <ChoicesGrid> component.
   * TODO: Encapsulate this logic in a high-order component instead.
   */
  gridArea?: string;
}

type StyleProps = {
  gridArea?: string;
  isSelected: boolean;
  variant?: ButtonVariant;
};

const selectedChoiceStyles = css<StyleProps>`
  box-shadow: inset 0 0 0 ${(p) =>
    p.theme.sizes.bordersRem.medium}rem currentColor;
  background: ${(p) => p.theme.colors.background};
  color: ${(p) => p.theme.colors.accentPrimary};
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.accentPrimary};
`;

const StyledChoiceButton = styled(Button)<StyleProps>`
  align-items: center;
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid currentColor;
  display: flex;
  grid-area: ${(p) => p.gridArea};
  justify-content: left;
  padding: 0.5rem 0.75rem;
  text-align: left;
  width: 100%;

  ${(p) => p.isSelected && selectedChoiceStyles};

  &:active {
    ${selectedChoiceStyles};
  }
`;

const StyledContent = styled.div`
  align-items: center;
  display: flex;
  justify-content: left;
  text-align: left;
`;

const StyledCheckboxSection = styled.div`
  align-items: center;
  display: flex;
  flex-grow: 0;
  margin-right: 0.5rem;
  text-align: left;
`;

const StyledLabelSection = styled.div`
  flex-grow: 1;
  line-height: 0.8;
  text-align: left;
`;

const StyledLabel = styled(P)`
  margin-bottom: 0;
`;

export function ContestChoiceButton<T extends string = string>(
  props: ContestChoiceButtonProps<T>
): JSX.Element {
  const { caption, gridArea, isSelected, label, onSelect, value } = props;

  const onPress = useCallback(() => onSelect(value), [onSelect, value]);

  return (
    <StyledChoiceButton
      gridArea={gridArea}
      isSelected={!!isSelected}
      onPress={onPress}
      variant={isSelected ? 'primary' : 'regular'}
    >
      <StyledContent>
        <StyledCheckboxSection>
          <Checkbox checked={isSelected} />
        </StyledCheckboxSection>
        <StyledLabelSection>
          <StyledLabel>{label}</StyledLabel>
          {caption && <Caption weight="regular">{caption}</Caption>}
        </StyledLabelSection>
      </StyledContent>
    </StyledChoiceButton>
  );
}
