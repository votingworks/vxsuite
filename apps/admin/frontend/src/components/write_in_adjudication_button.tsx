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
  isFocused,
  caption,
  hasInvalidEntry,
}: {
  isSelected: boolean;
  value: string;
  officialCandidates: Candidate[];
  writeInCandidates: Candidate[];
  onChange: (value?: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  toggleVote: () => void;
  isFocused: boolean;
  caption?: React.ReactNode;
  hasInvalidEntry: boolean;
}): JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const theme = useTheme();

  function onKeyPress(val?: string) {
    return setInputValue(val || '');
  }

  const officialCandidateOptions = inputValue
    ? officialCandidates
        .filter((val) =>
          val.name.toLowerCase().includes(inputValue.toLowerCase())
        )
        .map((val) => ({ label: val.name, value: val.id }))
    : officialCandidates.map((val) => ({
        label: val.name,
        value: val.id,
      }));

  const writeInCandidateOptions = inputValue
    ? writeInCandidates
        .filter((val) =>
          val.name.toLowerCase().includes(inputValue.toLowerCase())
        )
        .map((val) => ({ label: val.name, value: val.id }))
    : writeInCandidates.map((val) => ({
        label: val.name,
        value: val.id,
      }));

  const options = writeInCandidateOptions.concat(officialCandidateOptions);

  // 'Add: ${inputValue}' entry if there is no exact match
  if (inputValue && !options.find((item) => item.label === inputValue)) {
    options.push({ label: `Add: ${inputValue}`, value: inputValue });
  }

  // If value has been entered and it is a new entry, add it the dropdown
  if (value && !options.find((option) => option.value === value)) {
    options.push({ label: value, value });
  }

  if (!inputValue) {
    options.push({ label: 'Not a mark', value: 'invalid' });
  }

  return (
    <Container style={{ zIndex: isFocused ? 20 : 0 }}>
      <CheckboxButton
        isChecked={isSelected}
        label="Write-in"
        onChange={toggleVote}
        style={{ borderRadius: '0.5rem 0.5rem 0 0' }}
      />
      <SearchSelect
        key={`${hasInvalidEntry}`}
        options={options}
        onBlur={onInputBlur}
        onFocus={onInputFocus}
        onInputChange={onKeyPress}
        onChange={(val) => {
          setInputValue('');
          onChange(val);
        }}
        value={value}
        isMulti={false}
        placeholder={
          !isFocused ? (
            <React.Fragment>
              <Icons.Warning
                color="warning"
                style={{ marginRight: '0.5rem' }}
              />
              {isSelected ? 'Adjudicate' : 'Unmarked'} Write-in
            </React.Fragment>
          ) : (
            'Search or add...'
          )
        }
        style={{
          borderRadius: '0 0 0.5rem 0.5rem',
          backgroundColor: value ? undefined : theme.colors.warningContainer,
        }}
      />
      {caption}
    </Container>
  );
}
