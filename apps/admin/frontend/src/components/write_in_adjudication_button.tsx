import { useState } from 'react';
import { useTheme } from 'styled-components';
import { CheckboxButton, Icons, SearchSelect } from '@votingworks/ui';
import { Candidate } from '@votingworks/types';

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

  const options = officialCandidateOptions.concat(writeInCandidateOptions);

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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: isFocused ? 20 : 2,
        width: '100%',
      }}
    >
      <CheckboxButton
        isChecked={isSelected}
        onChange={toggleVote}
        style={{ borderRadius: '0.5rem 0.5rem 0 0' }}
        label="Write-in"
      />
      <SearchSelect
        key={`${cvrId}-${value}-${isSelected}`}
        onChange={(val) => {
          onChange(val);
          setCurVal('');
        }}
        isMulti={false}
        options={options}
        placeholder={
          !isFocused && (
            <span>
              <Icons.Warning
                color="warning"
                style={{ marginRight: '0.5rem' }}
              />
              {isSelected ? 'Adjudicate' : 'Unmarked'} Write-in
            </span>
          )
        }
        style={{
          width: '100%',
          borderRadius: '0 0 0.5rem 0.5rem',
          backgroundColor: value ? undefined : theme.colors.warningContainer,
          backdropFilter: 'blur(5px)',
          background: 'rgba(0, 0, 0, 0.1)',
        }}
        onBlur={onInputBlur}
        onFocus={onInputFocus}
        onInputChange={onKeyPress}
        value={value}
      />
      {caption}
    </div>
  );
}
