import { Id } from '@votingworks/types';
import { Button, CheckboxButton, Icons } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import type { MarginalMarkStatus } from '../screens/contest_adjudication_screen';

const MarginalMarkFlag = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${(p) => p.theme.colors.warningContainer};
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-bottom: 0;
  border-radius: 0.5rem 0.5rem 0 0;
  color: ${(p) => p.theme.colors.neutral};
  font-weight: 500;
  padding: 0.25rem 0.5rem;

  button {
    gap: 0.25rem;
  }
`;

const IconTextContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StyledCheckboxButton = styled(CheckboxButton)<{
  onlyRoundBottom?: boolean;
}>`
  border-radius: ${({ onlyRoundBottom }) =>
    onlyRoundBottom ? '0 0 0.5rem 0.5rem' : '0.5rem'};
`;

export function ContestOptionButton({
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
  const showMarginalMarkFlag =
    marginalMarkStatus === 'pending' && onDismissFlag !== undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {showMarginalMarkFlag && (
        <MarginalMarkFlag>
          <IconTextContainer>
            <Icons.Warning color="warning" />
            Review marginal mark
          </IconTextContainer>
          <Button
            aria-label="Close"
            icon="X"
            fill="transparent"
            onPress={onDismissFlag}
            style={{ padding: '0' }}
            value={undefined}
          >
            Dismiss
          </Button>
        </MarginalMarkFlag>
      )}
      <StyledCheckboxButton
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
