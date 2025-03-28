import { Candidate } from '@votingworks/types';
import { CheckboxButton } from '@votingworks/ui';
import React from 'react';

export function CandidateButton({
  candidate,
  caption,
  disabled = false,
  isSelected,
  onSelect,
  onDeselect,
}: {
  candidate: Pick<Candidate, 'id' | 'name'>;
  caption?: React.ReactNode;
  disabled?: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDeselect: () => void;
}): React.ReactNode {
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
            onDeselect();
          }
        }}
      />
      {caption}
    </div>
  );
}
