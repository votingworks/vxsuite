import { Candidate } from '@votingworks/types';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';
import React, { useState } from 'react';
import styled, { useTheme } from 'styled-components';

const RoundedCheckboxButton = styled(CheckboxButton)`
  border-radius: 0.5rem 0.5rem 0 0;
`;

export function MarkAdjudicationButton({
  candidate,
  isSelected,
  isFocused,
  onSelect,
  onDeselect,
  caption,
  disabled,
}: {
  candidate: Pick<Candidate, 'id' | 'name'>;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
  onDeselect?: () => void;
  caption?: React.ReactNode;
  disabled?: boolean;
}): JSX.Element {
  const theme = useTheme();
  const [isMark, setIsMark] = useState<boolean>();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <RoundedCheckboxButton
        disabled={disabled}
        isChecked={isMark ?? false}
        key={candidate.id}
        label={candidate.name}
        onChange={() => {
          setIsMark(!isMark);
          if (!isSelected) {
            onSelect();
          } else {
            onDeselect?.();
          }
        }}
      />
      <SearchSelect
        aria-label="Select valid or invalid mark"
        menuPortalTarget={document.body}
        options={[
          { label: 'Not a mark', value: false },
          { label: 'Valid Mark', value: true },
        ]}
        onChange={(val) => val !== undefined && setIsMark(val)}
        value={isMark}
        placeholder={
          isFocused ? (
            'Select…'
          ) : (
            <React.Fragment>
              <Icons.Warning
                color="warning"
                style={{ marginRight: '0.5rem' }}
              />
              {isSelected ? 'Adjudicate Mark' : 'Review Possible Mark'}
            </React.Fragment>
          )
        }
        style={{
          backgroundColor:
            isMark === undefined ? theme.colors.warningContainer : undefined,
          borderRadius: '0 0 0.5rem 0.5rem',
        }}
      />
      {caption}
    </div>
  );
}
