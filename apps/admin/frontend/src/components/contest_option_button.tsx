import React, { forwardRef } from 'react';
import { Id } from '@votingworks/types';
import { CheckboxButton } from '@votingworks/ui';
import styled from 'styled-components';
import type { MarginalMarkStatus } from '../screens/contest_adjudication_screen';
import { MarginalMarkFlag } from './marginal_mark_flag';

const StyledCheckboxButton = styled(CheckboxButton)<{
  onlyRoundBottom?: boolean;
}>`
  border-radius: ${({ onlyRoundBottom }) =>
    onlyRoundBottom ? '0 0 0.5rem 0.5rem' : '0.5rem'};
`;

interface Props {
  option: { id: Id; label: string };
  isSelected: boolean;
  onSelect: () => void;
  onDeselect?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
  marginalMarkStatus?: MarginalMarkStatus;
  onDismissFlag?: () => void;
  tabIndex?: number;
}

export const ContestOptionButton = forwardRef<HTMLDivElement, Props>(
  (
    {
      option,
      isSelected,
      onSelect,
      onDeselect,
      caption,
      disabled,
      marginalMarkStatus,
      onDismissFlag,
      tabIndex,
    },
    ref
  ) => {
    const showMarginalMarkFlag =
      marginalMarkStatus === 'pending' && onDismissFlag !== undefined;

    return (
      <div
        tabIndex={tabIndex}
        ref={ref}
        data-option-id={option.id}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {showMarginalMarkFlag && (
          <MarginalMarkFlag onDismissFlag={onDismissFlag} />
        )}
        <StyledCheckboxButton
          tabIndex={-1}
          disabled={disabled}
          onlyRoundBottom={showMarginalMarkFlag}
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
) as React.ForwardRefExoticComponent<
  Props & React.RefAttributes<HTMLDivElement>
>;

ContestOptionButton.displayName = 'ContestOptionButton';
