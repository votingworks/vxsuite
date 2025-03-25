import { Candidate } from '@votingworks/types';
import { CheckboxButton } from '@votingworks/ui';
import React from 'react';

export function CandidateButton({
  candidate,
  isSelected,
  onSelect,
  onDeselect,
  caption,
  disabled = false,
}: {
  candidate: Pick<Candidate, 'id' | 'name'>;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
}): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <CheckboxButton
        key={candidate.id}
        onChange={() => {
          if (!isSelected) {
            onSelect();
          } else {
            onDeselect();
          }
        }}
        disabled={disabled}
        label={candidate.name}
        isChecked={isSelected}
      />
      {caption}
    </div>
  );
}
