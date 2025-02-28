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
  margin: 8px;

  /* Increase contrast between selected/unselected options when disabled by
   * removing the darkening filter for unselected options. */
  &[disabled] {
    ${(p) => p.color === 'neutral' && `filter: none;`}
  }
`;

export function WriteInAdjudicationButton({
  isSelected,
  value,
  officialCandidateOptions,
  onChange,
  onInputFocus,
  onInputBlur,
  toggleVote,
}: {
  isSelected: boolean;
  value: string;
  officialCandidateOptions: Candidate[];
  onChange: (value?: string) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  toggleVote: () => void;
}): JSX.Element {
  const [curVal, setCurVal] = useState('');
  const theme = useTheme();

  function onKeyPress(val?: string) {
    return setCurVal(val || '');
  }

  const options = curVal
    ? officialCandidateOptions
        .filter((val) => val.name.includes(curVal))
        .map((val) => ({ label: val.name, value: val.id }))
    : officialCandidateOptions.map((val) => ({
        label: val.name,
        value: val.id,
      }));
  if (curVal) {
    options.push({ label: `Add: ${curVal}`, value: curVal });
  } else {
    options.unshift({ label: 'Not a mark', value: 'invalid' });
  }
  if (value && !curVal && !options.find((option) => option.value === value)) {
    options.push({ label: value, value });
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 2,
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
        {value ? 'Write-in' : 'Write-in'}
      </CandidateStyledButton>
      <SearchSelect
        onChange={(val) => {
          onChange(val);
          setCurVal('');
        }}
        isMulti={false}
        options={options}
        placeholder={
          <span>
            <Icons.Warning color="warning" style={{ marginRight: '0.5rem' }} />
            Adjudicate Write-in
          </span>
        }
        style={{
          width: '100%',
          borderRadius: '0 0 0.5rem 0.5rem',
          backgroundColor: value ? undefined : theme.colors.warningContainer,
        }}
        onBlur={onInputBlur}
        onFocus={onInputFocus}
        onInputChange={onKeyPress}
        value={value}
      />
    </div>
  );
}
