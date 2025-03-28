import React, { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;

  /* Prevent the CheckboxButton bottom border from being cutoff on hover
   * from the SearchSelect, which has a higher z-index */
  button:focus-visible {
    z-index: 10;
  }
`;

export function WriteInAdjudicationButton({
  caption,
  isFocused,
  isSelected,
  hasInvalidEntry,
  onChange,
  onInputFocus,
  onInputBlur,
  toggleVote,
  value,
  officialCandidateNames,
  writeInCandidateNames,
}: {
  caption?: React.ReactNode;
  isFocused: boolean;
  isSelected: boolean;
  hasInvalidEntry: boolean;
  // newVal can be name of new or existing candidate,
  // keyword 'invalid' for invalid write-in, or undefined
  onChange: (newVal?: string) => void;
  onInputBlur: () => void;
  onInputFocus: () => void;
  toggleVote: () => void;
  value: string;
  officialCandidateNames: string[];
  writeInCandidateNames: string[];
}): JSX.Element {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState('');
  const inputValueLowerCase = inputValue.toLowerCase();

  function onKeyPress(val?: string) {
    return setInputValue(val || '');
  }

  const filteredCandidateOptions = inputValue
    ? officialCandidateNames.filter((name) =>
        name.toLowerCase().includes(inputValueLowerCase)
      )
    : officialCandidateNames;
  const filteredWriteInCandidateOptions = inputValue
    ? writeInCandidateNames.filter((name) =>
        name.toLowerCase().includes(inputValueLowerCase)
      )
    : writeInCandidateNames;
  const options = filteredWriteInCandidateOptions
    .concat(filteredCandidateOptions)
    .map((name) => ({
      label: name,
      value: name,
    }));

  // 'Add: NEW_CANDIDATE' entry if there is no exact match
  if (
    inputValue &&
    !options.find(
      (item) => item.label.toLowerCase() === inputValue.toLowerCase()
    )
  ) {
    options.push({ label: `Add: ${inputValue}`, value: inputValue });
  }

  // If value has been entered and it is a new entry, add it the dropdown
  if (value && !options.find((option) => option.label === value)) {
    options.push({ label: value, value });
  }

  if (!inputValue) {
    options.unshift({ label: 'Not a mark', value: 'invalid' });
  }

  return (
    <Container style={{ zIndex: isFocused ? 10 : 0 }}>
      <CheckboxButton
        isChecked={isSelected}
        label="Write-in"
        onChange={toggleVote}
        style={{ borderRadius: '0.5rem 0.5rem 0 0' }}
      />
      <SearchSelect
        aria-label="Select or add write-in candidate"
        // The inner input does not clear the previous value when a
        // double vote entry is detected because the `value` prop never
        // changes. `hasInvalidEntry` as the key forces a re-render
        key={`${hasInvalidEntry}`}
        menuPortalTarget={document.body}
        options={options}
        onBlur={onInputBlur}
        onFocus={onInputFocus}
        onInputChange={onKeyPress}
        onChange={(val) => {
          setInputValue('');
          onChange(val);
        }}
        value={value}
        placeholder={
          isFocused ? (
            'Search or add...'
          ) : (
            <React.Fragment>
              <Icons.Warning
                color="warning"
                style={{ marginRight: '0.5rem' }}
              />
              {isSelected ? 'Adjudicate' : 'Unmarked'} Write-in
            </React.Fragment>
          )
        }
        style={{
          backgroundColor: value ? undefined : theme.colors.warningContainer,
          borderRadius: '0 0 0.5rem 0.5rem',
        }}
      />
      {caption}
    </Container>
  );
}
