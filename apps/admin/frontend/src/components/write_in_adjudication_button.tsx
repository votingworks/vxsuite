import React, { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';
import { normalizeWriteInName } from '../utils/write_ins';

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

const RoundedCheckboxButton = styled(CheckboxButton)`
  border-radius: 0.5rem 0.5rem 0 0;
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
  const normalizedInputValue = normalizeWriteInName(inputValue);

  function onInputChange(val?: string) {
    return setInputValue(val || '');
  }

  const filteredCandidateOptions = inputValue
    ? officialCandidateNames.filter((name) =>
        normalizeWriteInName(name).includes(normalizedInputValue)
      )
    : officialCandidateNames;
  const filteredWriteInCandidateOptions = inputValue
    ? writeInCandidateNames.filter((name) =>
        normalizeWriteInName(name).includes(normalizedInputValue)
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
    !options.some(
      (item) => normalizeWriteInName(item.label) === normalizedInputValue
    )
  ) {
    options.push({ label: `Add: ${inputValue}`, value: inputValue });
  }

  // If value has been entered and it is a new entry, add it the dropdown
  if (value && !options.some((option) => option.label === value)) {
    options.push({ label: value, value });
  }

  if (!inputValue) {
    options.unshift({ label: 'Not a mark', value: 'invalid' });
  }

  return (
    <Container style={{ zIndex: isFocused ? 10 : 0 }}>
      <RoundedCheckboxButton
        isChecked={isSelected}
        label="Write-in"
        onChange={toggleVote}
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
        onInputChange={onInputChange}
        onChange={(val) => {
          setInputValue('');
          onChange(val);
        }}
        value={value}
        placeholder={
          isFocused ? (
            'Search or add…'
          ) : (
            <React.Fragment>
              <Icons.Warning
                color="warning"
                style={{ marginRight: '0.5rem' }}
              />
              {isSelected ? 'Adjudicate Write-in' : 'Unmarked Write-in'}{' '}
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
