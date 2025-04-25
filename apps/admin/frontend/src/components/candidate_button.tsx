import { Candidate } from '@votingworks/types';
import { CheckboxButton } from '@votingworks/ui';
import React from 'react';

export function CandidateButton({
  candidate,
  isSelected,
  onSelect,
  onDeselect,
  caption,
  disabled,
}: {
  candidate: Pick<Candidate, 'id' | 'name'>;
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
        key={candidate.id}
        label={candidate.name}
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
