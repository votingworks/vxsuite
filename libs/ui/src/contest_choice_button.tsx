import React, { useCallback } from 'react';
import { DefaultTheme, css } from 'styled-components';
import { SizeMode } from '@votingworks/types';
import { styled } from './styled.js';

import { Button, ButtonVariant } from './button.js';
import { Checkbox } from './checkbox.js';
import { Caption, P } from './typography.js';

export interface ContestChoiceButtonProps<T> {
  'aria-label'?: string;
  caption?: React.ReactNode;
  choice: T;
  isSelected?: boolean;
  isDerivedVote?: boolean;
  label: React.ReactNode;
  onPress: (value: T) => void;

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
  isDerivedVote: boolean;
  variant?: ButtonVariant;
}

const COMPACT_SIZE_MODES = new Set<SizeMode>(['touchLarge', 'touchExtraLarge']);

function isCompactMode(p: { theme: DefaultTheme }) {
  return COMPACT_SIZE_MODES.has(p.theme.sizeMode);
}

const selectedChoiceStyles = css<StyleProps>`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.primary};
`;

const derivedVoteStyles = css<StyleProps>`
  color: ${(p) => p.theme.colors.primary};

  /* Use box-shadow instead of border to avoid a change in height */
  box-shadow: inset 0 0 0 ${(p) => p.theme.sizes.bordersRem.thin}rem
    ${(p) => p.theme.colors.primary};
`;

/* istanbul ignore next */
const OuterContainer = styled(Button)<StyleProps>`
  border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid currentColor;
  grid-area: ${(p) => p.gridArea};
  justify-content: start;
  min-width: min-content;
  padding: ${(p) => (isCompactMode(p) ? '0.25rem 0.3rem' : '0.5rem')};
  text-align: left;
  width: 100%;

  ${(p) => p.isSelected && selectedChoiceStyles};
  ${(p) => p.isDerivedVote && derivedVoteStyles};

  &:active {
    ${selectedChoiceStyles};
  }
`;

/* istanbul ignore next */
const Content = styled.span`
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: ${(p) => (isCompactMode(p) ? 0.25 : 0.5)}rem;
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

export function ContestChoiceButton<T>(
  props: ContestChoiceButtonProps<T>
): JSX.Element {
  const {
    'aria-label': ariaLabel,
    caption,
    choice,
    gridArea,
    isSelected,
    isDerivedVote,
    label,
    onPress,
  } = props;

  const handlePress = useCallback(() => onPress(choice), [onPress, choice]);

  return (
    <OuterContainer
      aria-label={ariaLabel}
      aria-selected={!!(isSelected || isDerivedVote)}
      gridArea={gridArea}
      isSelected={!!isSelected}
      isDerivedVote={!!isDerivedVote}
      onPress={handlePress}
      role="option"
      variant={isSelected ? 'primary' : 'neutral'}
    >
      <Content>
        <CheckboxContainer>
          <Checkbox checked={isSelected || isDerivedVote} />
        </CheckboxContainer>
        <LabelContainer>
          <Label>{label}</Label>
          {caption && <Caption weight="regular">{caption}</Caption>}
        </LabelContainer>
      </Content>
    </OuterContainer>
  );
}
