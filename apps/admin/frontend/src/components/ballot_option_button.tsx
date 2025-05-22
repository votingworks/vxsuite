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
  padding: 0.5rem;
  display: flex;
  justify-content: space-between;
  font-weight: 500;
  color: ${(p) => p.theme.colors.neutral};
  border-style: solid;
  box-shadow: none;
  font-size: 1rem;
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
  onSelect,
  onDeselect,
  caption,
  disabled,
  marginalMarkStatus,
  onDismissFlag,
}: {
  option: { id: Id; label: string };
  isSelected: boolean;
  onSelect: () => void;
  onDeselect?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
  marginalMarkStatus?: MarginalMarkStatus;
  onDismissFlag?: () => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {marginalMarkStatus === 'flagged' && onDismissFlag && (
        <MarginalMarkFlag hasVote={isSelected}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isSelected ? (
              <Icons.Done color="success" />
            ) : (
              <Icons.Warning color="warning" />
            )}
            Review marginal mark
          </div>
          <Button
            style={{ justifySelf: 'end', padding: 0 }}
            icon="X"
            onPress={onDismissFlag}
            aria-label="Close"
            value={undefined}
            fill="transparent"
          />
        </MarginalMarkFlag>
      )}
      <StyledCheckboxButton
        hasMarginalMark={marginalMarkStatus === 'flagged'}
        disabled={disabled}
        isChecked={isSelected}
        key={option.id}
        label={option.label}
        onChange={() => {
          if (!isSelected) {
            onSelect();
          } else {
            onDeselect?.();
          }
        }}
      />
      {caption}
    </div>
  );
}
