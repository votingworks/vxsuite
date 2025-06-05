import React, { forwardRef, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';
import { Candidate } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { normalizeWriteInName } from '../utils/adjudication';
import type {
  InvalidWriteIn,
  WriteInAdjudicationStatus,
} from '../screens/contest_adjudication_screen';

export const MAX_WRITE_IN_NAME_LENGTH = 200;
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

interface Props {
  isFocused: boolean;
  isSelected: boolean;
  status: Exclude<WriteInAdjudicationStatus, InvalidWriteIn | undefined>;
  onChange: (newStatus: Exclude<WriteInAdjudicationStatus, undefined>) => void;
  onInputBlur: () => void;
  onInputFocus: () => void;
  officialCandidates: Candidate[];
  writeInCandidates: Candidate[];
  hasInvalidEntry: boolean;
  caption?: React.ReactNode;
  label?: string;
}

export const WriteInAdjudicationButton = forwardRef<HTMLDivElement, Props>(
  (
    {
      isFocused,
      isSelected,
      status,
      onChange,
      onInputFocus,
      onInputBlur,
      officialCandidates,
      writeInCandidates,
      hasInvalidEntry,
      caption,
      label,
    },
    ref
  ) => {
    const theme = useTheme();
    const [inputValue, setInputValue] = useState('');
    const normalizedInputValue = normalizeWriteInName(inputValue);

    function onInputChange(val: string = '') {
      setInputValue(val);
    }

    const allCandidates = writeInCandidates.concat(officialCandidates);
    const candidateNames = allCandidates.map((c) => c.name);
    const filteredNames = inputValue
      ? candidateNames.filter((name) =>
          normalizeWriteInName(name).includes(normalizedInputValue)
        )
      : candidateNames;

    const candidateOptions = filteredNames.map((name) => ({
      label: name,
      value: name,
    }));

    let value: string;
    switch (status.type) {
      case 'pending': {
        value = '';
        break;
      }
      case 'new-write-in':
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
    if (value && !candidateOptions.some((option) => option.label === value)) {
      candidateOptions.unshift({ label: value, value });
    }

    // 'Press enter to add: NEW_CANDIDATE' entry if there is no exact match
    let newCandidateOption:
      | { label: React.ReactNode; value: string }
      | undefined;
    if (
      inputValue &&
      inputValue.length < MAX_WRITE_IN_NAME_LENGTH &&
      !candidateOptions.some(
        (item) => normalizeWriteInName(item.label) === normalizedInputValue
      )
    ) {
      newCandidateOption = {
        label: (
          <span>
            <Icons.Add style={{ marginRight: '.125rem' }} /> Press enter to add:{' '}
            {inputValue}
          </span>
        ),
        value: inputValue,
      };
    }

    let invalidMarkOption:
      | { label: React.ReactNode; value: string }
      | undefined;
    if (!inputValue) {
      invalidMarkOption = {
        label: (
          <span>
            <Icons.Disabled style={{ marginRight: '.125rem' }} /> Invalid mark
          </span>
        ),
        value: INVALID_KEY,
      };
    }

    const allOptions: Array<{ label: React.ReactNode; value: string }> = [
      ...(invalidMarkOption ? [invalidMarkOption] : []),
      ...candidateOptions,
      ...(newCandidateOption ? [newCandidateOption] : []),
    ];

    return (
      <Container ref={ref} style={{ zIndex: isFocused ? 10 : 0 }}>
        <RoundedCheckboxButton
          isChecked={isSelected}
          label={label ?? 'Write-in'}
          onChange={() =>
            onChange({ type: isSelected ? 'invalid' : 'pending' })
          }
        />
        <SearchSelect
          aria-label="Select or add write-in candidate"
          // The inner input does not clear the previous value when a
          // double vote entry is detected because the `value` prop never
          // changes. `hasInvalidEntry` as the key forces a re-render
          key={`${hasInvalidEntry}-${value}`}
          menuPortalTarget={document.body}
          options={allOptions}
          onBlur={onInputBlur}
          onFocus={onInputFocus}
          onInputChange={onInputChange}
          onChange={(val) => {
            setInputValue('');
            // we are guaranteed a value from SearchSelect with this use-case
            assert(val !== undefined && val !== '');
            if (val === INVALID_KEY) {
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
              onChange({ type: 'new-write-in', name: val });
            }
          }}
          minMenuHeight={300}
          noOptionsMessage={() =>
            `Entry exceeds max character length of ${MAX_WRITE_IN_NAME_LENGTH}`
          }
          value={value}
          placeholder={
            isFocused ? (
              'Type to search or add candidate…'
            ) : (
              <React.Fragment>
                <Icons.Warning
                  color="warning"
                  style={{ marginRight: '0.5rem' }}
                />
                {isSelected
                  ? 'Click to adjudicate write-in'
                  : 'Click to adjudicate Unmarked Write-in'}
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
) as React.ForwardRefExoticComponent<
  Props & React.RefAttributes<HTMLDivElement>
>;

WriteInAdjudicationButton.displayName = 'WriteInAdjudicationButton';
