import React, { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';
import { Candidate } from '@votingworks/types';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export function WriteInAdjudicationButton({
  isSelected,
  value,
  officialCandidates,
  writeInCandidates,
  onChange,
  onInputFocus,
  onInputBlur,
  toggleVote,
  cvrId,
  isFocused,
  caption,
}: {
  isSelected: boolean;
  value: string;
  officialCandidates: Candidate[];
  writeInCandidates: Candidate[];
  onChange: (value?: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  toggleVote: () => void;
  cvrId: string;
  isFocused: boolean;
  caption?: React.ReactNode;
}): JSX.Element {
  const [curVal, setCurVal] = useState('');
  const theme = useTheme();

  function onKeyPress(val?: string) {
    return setCurVal(val || '');
  }

  const officialCandidateOptions = curVal
    ? officialCandidates
        .filter((val) => val.name.toLowerCase().includes(curVal.toLowerCase()))
        .map((val) => ({ label: val.name, value: val.id }))
    : officialCandidates.map((val) => ({
        label: val.name,
        value: val.id,
      }));

  const writeInCandidateOptions = curVal
    ? writeInCandidates
        .filter((val) => val.name.toLowerCase().includes(curVal.toLowerCase()))
        .map((val) => ({ label: val.name, value: val.id }))
    : writeInCandidates.map((val) => ({
        label: val.name,
        value: val.id,
      }));

  const options = writeInCandidateOptions.concat(officialCandidateOptions);

  // 'add current value' entry if not an existing option
  if (curVal && !options.find((item) => item.label === curVal)) {
    options.push({ label: `Add: ${curVal}`, value: curVal });
  }

  // Show selected option, which will be filtered out from options
  if (value && !curVal && !options.find((option) => option.value === value)) {
    options.push({ label: value, value });
  }

  if (!curVal) {
    options.push({ label: 'Not a mark', value: 'invalid' });
  }

  return (
    <Container style={{ zIndex: isFocused ? 20 : 0 }}>
      <CheckboxButton
        label="Write-in"
        isChecked={isSelected}
        onChange={toggleVote}
        style={{ borderRadius: '0.5rem 0.5rem 0 0' }}
      />
      <SearchSelect
        key={`${cvrId}-${value}-${isSelected}`}
        isMulti={false}
        onChange={(val) => {
          onChange(val);
          setCurVal('');
        }}
        placeholder={
          !isFocused && (
            <React.Fragment>
              <Icons.Warning
                color="warning"
                style={{ marginRight: '0.5rem' }}
              />
              {isSelected ? 'Adjudicate' : 'Unmarked'} Write-in
            </React.Fragment>
          )
        }
        onBlur={onInputBlur}
        onFocus={onInputFocus}
        onInputChange={onKeyPress}
        options={options}
        style={{
          borderRadius: '0 0 0.5rem 0.5rem',
          backgroundColor: value ? undefined : theme.colors.warningContainer,
        }}
        value={value}
      />
      {caption}
    </Container>
  );
}
