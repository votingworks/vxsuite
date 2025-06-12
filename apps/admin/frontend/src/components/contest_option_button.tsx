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
  marginalMarkStatus?: MarginalMarkStatus;
  onSelect: () => void;
  onDeselect?: () => void;
  onDismissFlag?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
  tabIndex?: number;
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
      tabIndex,
    },
    ref
  ) => {
    const showMarginalMarkFlag =
      marginalMarkStatus === 'pending' && onDismissFlag !== undefined;

    return (
      <div
        data-option-id={option.id}
        style={{ display: 'flex', flexDirection: 'column' }}
        ref={ref}
        tabIndex={tabIndex}
      >
        {showMarginalMarkFlag && (
          <MarginalMarkFlag onDismissFlag={onDismissFlag} />
        )}
        <StyledCheckboxButton
          key={option.id}
          label={option.label}
          isChecked={isSelected}
          disabled={disabled}
          tabIndex={-1}
          onlyRoundBottom={showMarginalMarkFlag}
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
