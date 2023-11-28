import React, { useCallback } from 'react';
import styled, { css } from 'styled-components';

import { Button, ButtonPressEvent, ButtonVariant } from './button';
import { Checkbox } from './checkbox';
import { Caption, P } from './typography';

export interface ContestChoiceButtonProps<T extends string = string> {
  ariaLabel?: string;
  caption?: React.ReactNode;
  choice: T;
  isSelected?: boolean;
  label: React.ReactNode;
  onPress: (event: ButtonPressEvent, value: T) => void;

  /**
   * @deprecated Added to support pre-existing behaviour WRT the VxMark
   * <ChoicesGrid> component.
   * TODO: Encapsulate this logic in a high-order component instead.
   */
  gridArea?: string;
}

interface StyleProps {
  gridArea?: string;
  isSelected: boolean;
  variant?: ButtonVariant;
}

const selectedChoiceStyles = css<StyleProps>`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.primary};
`;

const OuterContainer = styled(Button)<StyleProps>`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid currentColor;
  grid-area: ${(p) => p.gridArea};
  justify-content: start;
  min-width: min-content;
  padding: 0.5rem;
  text-align: left;
  width: 100%;

  ${(p) => p.isSelected && selectedChoiceStyles};

  &:active {
    ${selectedChoiceStyles};
  }
`;

const Content = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
`;

const CheckboxContainer = styled.span`
  flex-grow: 0;
  flex-shrink: 0;
`;

const LabelContainer = styled.span`
  flex-grow: 1;
  line-height: 1;
`;

const Label = styled(P)`
  line-height: inherit;
  margin-bottom: 0;
`;

export function ContestChoiceButton<T extends string>(
  props: ContestChoiceButtonProps<T>
): JSX.Element {
  const { ariaLabel, caption, choice, gridArea, isSelected, label, onPress } =
    props;

  const handlePress = useCallback(
    (event: ButtonPressEvent) => onPress(event, choice),
    [onPress, choice]
  );

  return (
    <OuterContainer
      aria-label={ariaLabel}
      aria-selected={isSelected}
      gridArea={gridArea}
      isSelected={!!isSelected}
      onPress={handlePress}
      role="option"
      variant={isSelected ? 'primary' : 'neutral'}
    >
      <Content>
        <CheckboxContainer>
          <Checkbox checked={isSelected} />
        </CheckboxContainer>
        <LabelContainer>
          <Label>{label}</Label>
          {caption && <Caption weight="regular">{caption}</Caption>}
        </LabelContainer>
      </Content>
    </OuterContainer>
  );
}
