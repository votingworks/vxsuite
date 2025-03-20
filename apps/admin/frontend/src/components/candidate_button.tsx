import { Candidate } from '@votingworks/types';
import { Button } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

// styles closely imitate our RadioGroup buttons, but we don't use RadioGroup
// because we need to be able to deselect options by clicking them again
const CandidateStyledButton = styled(Button)`
  border-color: ${(p) => p.theme.colors.outline};
  border-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  flex-wrap: nowrap;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding-left: 0.5rem;
  text-align: left;
  width: 100%;
  word-break: break-word;
  flex-shrink: 0;

  /* Increase contrast between selected/unselected options when disabled by
   * removing the darkening filter for unselected options. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
`;

export function CandidateButton({
  candidate,
  isSelected,
  onSelect,
  onDeselect,
  caption,
  disabled = false,
}: {
  candidate: Pick<Candidate, 'id' | 'name'>;
  isSelected?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
}): React.ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <CandidateStyledButton
        key={candidate.id}
        onPress={() => {
          if (!isSelected) {
            onSelect();
          } else {
            onDeselect();
          }
        }}
        color={isSelected ? 'primary' : 'neutral'}
        fill={isSelected ? 'tinted' : 'outlined'}
        icon={isSelected ? 'CircleDot' : 'Circle'}
        disabled={disabled}
      >
        {candidate.name}
      </CandidateStyledButton>
      {caption}
    </div>
  );
}
