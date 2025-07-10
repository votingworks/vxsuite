import React, { forwardRef, useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';
import { Candidate } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { normalizeWriteInName } from '../utils/adjudication';
import type {
  MarginalMarkStatus,
  WriteInAdjudicationStatus,
} from '../hooks/use_contest_adjudication_state';

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

const StyledCheckboxButton = styled(CheckboxButton)<{
  roundBottom?: boolean;
  isSelected?: boolean;
  isFocused?: boolean;
}>`
  border-radius: ${({ roundBottom }) => {
    if (roundBottom) return '0.5rem';
    return '0.5rem 0.5rem 0 0';
  }};

  ${({ isSelected, isFocused, theme }) =>
    !isSelected &&
    isFocused &&
    `
      &:hover {
        /* the default hover color blends in with the background overlay */
        background-color: ${theme.colors.primaryContainer} !important;
      }
    `}
`;

interface SearchOption {
  label: React.ReactNode;
  value: string;
}
const OptionWithIcon = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

interface Props {
  isFocused: boolean;
  isSelected: boolean;
  writeInStatus: WriteInAdjudicationStatus;
  marginalMarkStatus: MarginalMarkStatus;
  onChange: (newStatus: Exclude<WriteInAdjudicationStatus, undefined>) => void;
  onInputBlur: () => void;
  onInputFocus: () => void;
  officialCandidates: Candidate[];
  writeInCandidates: Candidate[];
  hasInvalidEntry: boolean;
  caption?: React.ReactNode;
  disabled?: boolean;
  label?: string;
}

export const WriteInAdjudicationButton = forwardRef<HTMLDivElement, Props>(
  (
    {
      isFocused,
      isSelected,
      writeInStatus,
      marginalMarkStatus,
      onChange,
      onInputFocus,
      onInputBlur,
      officialCandidates,
      writeInCandidates,
      hasInvalidEntry,
      caption,
      disabled,
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

    let showSearchSelect = true;
    let value: string | undefined;
    switch (writeInStatus?.type) {
      case undefined: {
        showSearchSelect = marginalMarkStatus === 'pending';
        break;
      }
      case 'invalid': {
        showSearchSelect = false;
        break;
      }
      case 'pending': {
        value = '';
        break;
      }
      case 'new-write-in':
      case 'existing-official':
      case 'existing-write-in': {
        value = writeInStatus.name;
        break;
      }
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(writeInStatus, 'type');
      }
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

    // If value has been entered and it is a new entry, add it the dropdown
    if (value && !candidateOptions.some((option) => option.label === value)) {
      candidateOptions.unshift({ label: value, value });
    }

    // 'Press enter to add: NEW_CANDIDATE' entry if there is no exact match
    let addCandidateOption: SearchOption | undefined;
    if (
      inputValue &&
      inputValue.length < MAX_WRITE_IN_NAME_LENGTH &&
      !candidateOptions.some(
        (item) => normalizeWriteInName(item.label) === normalizedInputValue
      )
    ) {
      addCandidateOption = {
        label: (
          <OptionWithIcon>
            <Icons.Add /> Press enter to add: {inputValue}
          </OptionWithIcon>
        ),
        value: inputValue,
      };
    }

    let invalidMarkOption: SearchOption | undefined;
    if (!inputValue) {
      invalidMarkOption = {
        label: (
          <OptionWithIcon>
            <Icons.Disabled /> Invalid
          </OptionWithIcon>
        ),
        value: INVALID_KEY,
      };
    }

    const allOptions: SearchOption[] = [
      ...(invalidMarkOption ? [invalidMarkOption] : []),
      ...candidateOptions,
      ...(addCandidateOption ? [addCandidateOption] : []),
    ];

    return (
      <Container style={{ zIndex: isFocused ? 10 : 0 }} ref={ref}>
        <StyledCheckboxButton
          isChecked={isSelected}
          isFocused={isFocused}
          disabled={disabled}
          label={label ?? 'Write-In'}
          roundBottom={!showSearchSelect}
          onChange={() => {
            onChange({ type: isSelected ? 'invalid' : 'pending' });
          }}
        />
        {showSearchSelect && (
          <SearchSelect
            aria-label="Select or add write-in candidate"
            disabled={disabled}
            options={allOptions}
            value={value}
            // The inner input does not consistently clear the previous value
            // when a double vote entry is detected because the `value` prop never
            // changes, or when scrolling cvrs. The key is used to force a re-render
            key={String(hasInvalidEntry) + value}
            maxMenuHeight={450} // 6 options, 75px each
            minMenuHeight={300}
            menuPortalTarget={document.body}
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
            noOptionsMessage={() =>
              `Entry exceeds max character length of ${MAX_WRITE_IN_NAME_LENGTH}`
            }
            placeholder={
              isFocused ? (
                'Type to search or add candidate…'
              ) : (
                <React.Fragment>
                  <Icons.Warning
                    color="warning"
                    style={{ marginRight: '0.5rem' }}
                  />
                  Click to adjudicate
                </React.Fragment>
              )
            }
            style={{
              backgroundColor: value
                ? undefined
                : theme.colors.warningContainer,
              borderRadius: '0 0 0.5rem 0.5rem',
              marginTop: '-2px', // helps minor spacing gap
            }}
          />
        )}
        {caption}
      </Container>
    );
  }
) as React.ForwardRefExoticComponent<
  Props & React.RefAttributes<HTMLDivElement>
>;

WriteInAdjudicationButton.displayName = 'WriteInAdjudicationButton';
