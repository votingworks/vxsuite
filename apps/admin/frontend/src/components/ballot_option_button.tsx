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
  resolveMarginalMark,
}: {
  option: { id: Id; label: string };
  isSelected: boolean;
  onSelect: () => void;
  onDeselect?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
  marginalMarkStatus?: MarginalMarkStatus;
  resolveMarginalMark?: () => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {marginalMarkStatus === 'pending' && resolveMarginalMark && (
        <MarginalMarkFlag hasVote={isSelected}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isSelected ? (
              <Icons.Done color="success" />
            ) : (
              <Icons.Warning color="warning" />
            )}
            Is marginal mark valid?
          </div>
          <Button
            style={{ padding: '0.25rem 0.75rem' }}
            // icon="X"
            onPress={() => {
              onSelect();
              resolveMarginalMark();
            }}
            aria-label="Close"
            value="undefined"
            // fill="transparent"
          >
            Yes
          </Button>
          <Button
            style={{ padding: '0.25rem 0.75rem' }}
            // icon="X"
            onPress={resolveMarginalMark}
            aria-label="Close"
            value="undefined"
            // fill="transparent"
          >
            No
          </Button>
        </MarginalMarkFlag>
      )}
      <StyledCheckboxButton
        hasMarginalMark={marginalMarkStatus === 'pending'}
        disabled={disabled}
        isChecked={
          marginalMarkStatus === 'pending' ? 'indeterminate' : isSelected
        }
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
