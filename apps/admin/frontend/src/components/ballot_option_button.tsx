import { Id } from '@votingworks/types';
import { CheckboxButton } from '@votingworks/ui';
import React from 'react';

export function BallotOptionButton({
  option,
  isSelected,
  onSelect,
  onDeselect,
  caption,
  disabled,
}: {
  option: { id: Id; label: string };
  isSelected: boolean;
  onSelect: () => void;
  onDeselect?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <CheckboxButton
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
