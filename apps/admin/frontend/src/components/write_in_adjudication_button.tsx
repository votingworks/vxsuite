import React, { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';
import { Candidate } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { normalizeWriteInName } from '../utils/write_ins';
import type {
  InvalidWriteIn,
  WriteInAdjudicationStatus,
} from '../screens/contest_adjudication_screen';

const MAX_NAME_LENGTH = 200;
const INVALID_KEY = '\0invalid';

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
  label,
  onChange,
  onInputFocus,
  onInputBlur,
  status,
  officialCandidates,
  writeInCandidates,
}: {
  caption?: React.ReactNode;
  isFocused: boolean;
  isSelected: boolean;
  label?: string;
  hasInvalidEntry: boolean;
  status: Exclude<WriteInAdjudicationStatus, undefined | InvalidWriteIn>;
  onChange: (newStatus: Exclude<WriteInAdjudicationStatus, undefined>) => void;
  onInputBlur: () => void;
  onInputFocus: () => void;
  officialCandidates: Candidate[];
  writeInCandidates: Candidate[];
}): JSX.Element {
  const theme = useTheme();
  const [inputValue, setInputValue] = useState('');
  const normalizedInputValue = normalizeWriteInName(inputValue);
  function onInputChange(val?: string) {
    return setInputValue(val || '');
  }

  const allCandidates = writeInCandidates.concat(officialCandidates);
  const candidateNames = allCandidates.map((c) => c.name);
  const filteredNames = inputValue
    ? candidateNames.filter((name) =>
        normalizeWriteInName(name).includes(normalizedInputValue)
      )
    : candidateNames;
  const options = filteredNames.map((name) => ({
    label: name,
    value: name,
  }));

  let value: string;
  switch (status.type) {
    case 'pending': {
      value = '';
      break;
    }
    case 'new':
    case 'existing-official':
    case 'existing-write-in': {
      value = status.name;
      break;
    }
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(status, 'type');
    }
  }

  // If value has been entered and it is a new entry, add it the dropdown
  if (value && !options.some((option) => option.label === value)) {
    options.unshift({ label: value, value });
  }

  // 'Add: NEW_CANDIDATE' entry if there is no exact match
  if (
    inputValue &&
    inputValue.length < MAX_NAME_LENGTH &&
    !options.some(
      (item) => normalizeWriteInName(item.label) === normalizedInputValue
    )
  ) {
    options.push({ label: `Add: ${inputValue}`, value: inputValue });
  }

  if (!inputValue) {
    options.unshift({ label: 'Not a mark', value: INVALID_KEY });
  }

  return (
    <Container style={{ zIndex: isFocused ? 10 : 0 }}>
      <RoundedCheckboxButton
        isChecked={isSelected}
        label={label ?? 'Write-in'}
        onChange={() => onChange({ type: isSelected ? 'invalid' : 'pending' })}
      />
      <SearchSelect
        aria-label="Select or add write-in candidate"
        // The inner input does not clear the previous value when a
        // double vote entry is detected because the `value` prop never
        // changes. `hasInvalidEntry` as the key forces a re-render
        key={`${hasInvalidEntry}-${value}`}
        menuPortalTarget={document.body}
        options={options}
        onBlur={onInputBlur}
        onFocus={onInputFocus}
        onInputChange={onInputChange}
        onChange={(val) => {
          setInputValue('');
          if (!val) {
            onChange({ type: 'pending' });
          } else if (val === INVALID_KEY) {
            onChange({ type: 'invalid' });
          } else if (filteredNames.includes(val)) {
            let candidate = officialCandidates.find((c) => c.name === val);
            const isOfficialCandidate = !!candidate;
            if (!isOfficialCandidate) {
              candidate = writeInCandidates.find((c) => c.name === val);
            }
            assert(candidate !== undefined);
            const type = isOfficialCandidate
              ? 'existing-official'
              : 'existing-write-in';
            onChange({ type, ...candidate });
          } else {
            onChange({ type: 'new', name: val });
          }
        }}
        minMenuHeight={300}
        noOptionsMessage={() =>
          `Entry exceeds max character length of ${MAX_NAME_LENGTH}`
        }
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
              {isSelected ? 'Adjudicate Write-in' : 'Unmarked Write-in'}
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
