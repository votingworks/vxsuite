import { useState } from 'react';
import styled, { useTheme } from 'styled-components';
import { Button, Icons, SearchSelect } from '@votingworks/ui';
import { Candidate } from '@votingworks/types';

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

  if (!curVal) {
    options.push({ label: 'Not a mark', value: 'invalid' });
  }

  // 'add current value' entry
  if (curVal) {
    options.push({ label: `Add: ${curVal}`, value: curVal });
  }

  // current hack to show selected option...
  if (value && !curVal && !options.find((option) => option.value === value)) {
    options.push({ label: value, value });
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
      <CandidateStyledButton
        color={isSelected ? 'primary' : 'neutral'}
        fill={isSelected ? 'tinted' : 'outlined'}
        icon={isSelected ? 'CircleDot' : 'Circle'}
        onPress={toggleVote}
        style={{ borderRadius: '0.5rem 0.5rem 0 0' }}
      >
        Write-in
      </CandidateStyledButton>
      <SearchSelect
        key={`${cvrId}-${value}-${isSelected}`}
        onChange={(val) => {
          onChange(val);
          setCurVal('');
        }}
        isMulti={false}
        options={options}
        placeholder={
          <span>
            <Icons.Warning color="warning" style={{ marginRight: '0.5rem' }} />
            {isSelected ? 'Adjudicate' : 'Unmarked'} Write-in
          </span>
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
