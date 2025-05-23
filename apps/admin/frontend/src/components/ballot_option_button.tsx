import { Id } from '@votingworks/types';
import { Button, CheckboxButton, Icons } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import type { MarginalMarkStatus } from '../screens/contest_adjudication_screen';

const MarginalMarkFlag = styled.div<{ hasVote: boolean }>`
  border-radius: 0.5rem 0.5rem 0 0;
  background-color: ${({ hasVote, theme }) =>
    hasVote ? theme.colors.containerLow : theme.colors.warningContainer};
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-bottom: 0;
  padding: 0.25rem 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 500;
  color: ${(p) => p.theme.colors.neutral};
  border-style: solid;
  box-shadow: none;
  font-size: 1rem;
`;

const ButtonTextContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${({ theme }) => theme.colors.neutral};
`;

const StyledCheckboxButton = styled(CheckboxButton)<{
  hasMarginalMark: boolean;
}>`
  border-radius: ${({ hasMarginalMark }) =>
    hasMarginalMark ? '0 0 0.5rem 0.5rem' : undefined};
`;

export function BallotOptionButton({
  option,
  isSelected,
  isFocused,
  onSelect,
  onDeselect,
  caption,
  disabled,
  marginalMarkStatus,
  onDismissFlag,
  onClickFlag,
}: {
  option: { id: Id; label: string };
  isSelected: boolean;
  isFocused?: boolean;
  onSelect: () => void;
  onDeselect?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
  marginalMarkStatus?: MarginalMarkStatus;
  onDismissFlag?: () => void;
  onClickFlag?: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        zIndex: isFocused ? 20 : 0,
      }}
    >
      {marginalMarkStatus === 'pending' && onDismissFlag && (
        <MarginalMarkFlag hasVote={isSelected}>
          <Button
            style={{ padding: 0 }}
            onPress={onClickFlag || (() => undefined)}
            aria-label="Zoom on marginal mark"
            fill="transparent"
          >
            <ButtonTextContainer>
              <Icons.Warning color="warning" />
              Review marginal mark
            </ButtonTextContainer>
          </Button>
          <Button
            onPress={onDismissFlag}
            aria-label="Close"
            value={undefined}
            fill="transparent"
            style={{ padding: '0' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              Dismiss
              <Icons.X />
            </div>
          </Button>
        </MarginalMarkFlag>
      )}
      <StyledCheckboxButton
        hasMarginalMark={marginalMarkStatus === 'pending'}
        disabled={disabled}
        isChecked={isSelected}
        key={option.id}
        label={option.label}
        onChange={() => {
          if (!isSelected) {
            onSelect();
            onDismissFlag?.();
          } else {
            onDeselect?.();
          }
        }}
      />
      {caption}
    </div>
  );
}
