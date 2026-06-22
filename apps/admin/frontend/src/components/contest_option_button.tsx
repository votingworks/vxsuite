import React, { forwardRef } from 'react';
import { Id } from '@votingworks/types';
import { CheckboxButton } from '@votingworks/ui';
import styled from 'styled-components';
import { MarginalMarkFlag } from './marginal_mark_flag';
import {
  isMarginalMarkPending,
  type MarginalMarkStatus,
} from '../hooks/use_contest_adjudication_state';

const StyledCheckboxButton = styled(CheckboxButton)<{
  onlyRoundBottom?: boolean;
  primaryOutline?: boolean;
}>`
  border-radius: ${({ onlyRoundBottom }) =>
    onlyRoundBottom ? '0 0 0.5rem 0.5rem' : '0.5rem'};
  border-color: ${(p) =>
    p.primaryOutline ? p.theme.colors.primary : undefined};
  background-color: ${(p) =>
    p.primaryOutline ? p.theme.colors.containerLow : undefined};
`;

interface Props {
  option: { id: Id; label: React.ReactNode };
  isSelected: boolean;
  marginalMarkStatus?: MarginalMarkStatus;
  onSelect: () => void;
  onDeselect?: () => void;
  onDismissFlag?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
  isDerivedVote?: boolean;
}

export const ContestOptionButton = forwardRef<HTMLDivElement, Props>(
  (
    {
      option,
      isSelected,
      marginalMarkStatus,
      onSelect,
      onDeselect,
      onDismissFlag,
      caption,
      disabled,
      isDerivedVote,
    },
    ref
  ) => {
    const showMarginalMarkFlag =
      isMarginalMarkPending(marginalMarkStatus) && onDismissFlag !== undefined;

    return (
      <div style={{ display: 'flex', flexDirection: 'column' }} ref={ref}>
        {showMarginalMarkFlag && (
          <MarginalMarkFlag onDismissFlag={onDismissFlag} />
        )}
        <StyledCheckboxButton
          key={option.id}
          label={option.label}
          isChecked={isSelected || Boolean(isDerivedVote)}
          disabled={disabled}
          onlyRoundBottom={showMarginalMarkFlag}
          primaryOutline={isDerivedVote}
          onChange={() => {
            if (!isSelected) {
              onSelect();
              if (showMarginalMarkFlag) {
                onDismissFlag();
              }
            } else {
              onDeselect?.();
            }
          }}
        />
        {caption}
      </div>
    );
  }
) as React.ForwardRefExoticComponent<
  Props & React.RefAttributes<HTMLDivElement>
>;

ContestOptionButton.displayName = 'ContestOptionButton';
