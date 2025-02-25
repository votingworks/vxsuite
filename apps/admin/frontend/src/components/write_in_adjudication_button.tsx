import { useState } from 'react';
import styled from 'styled-components';
import { Button, SearchSelect } from '@votingworks/ui';
import { Candidate } from '@votingworks/types';

// styles closely imitate our RadioGroup buttons, but we don't use RadioGroup
// because we need to be able to deselect options by clicking them again
const WriteInContainer = styled.div`
  background-color: hsl(262deg, 53%, 90%);
  color: ${(p) => p.theme.colors.primary};
  border-color: ${(p) => p.theme.colors.outline};
  border-width: ${(p) => p.theme.sizes.bordersRem.thin}rem;
  border-style: solid;
  border-radius: 0.5rem;
  flex-wrap: nowrap;
  align-items: start;
  font-weight: ${(p) => p.theme.sizes.fontWeight.regular};
  justify-content: start;
  padding: 1rem 0.5rem;
  text-align: left;
  width: 100%;
  word-break: break-word;
  flex-shrink: 0;

  & > span {
    width: 100%;
  }
`;

export function WriteInAdjudicationButton({
  value,
  officialCandidateOptions,
  onChange,
}: {
  value: string;
  officialCandidateOptions: Candidate[];
  onChange: (value?: string  ) => void;
}): JSX.Element {
  const [curVal, setCurVal] = useState('');

  function onKeyPress(val?: string  ) { return setCurVal(val || '') };

  const options = curVal
    ? officialCandidateOptions
        .filter((val) => val.name.includes(curVal))
        .map((val) => ({ label: val.name, value: val.id }))
    : officialCandidateOptions.map((val) => ({
        label: val.name,
        value: val.id,
      }));
  console.log(value, options);
  if (curVal) {
    options.push({ label: `Add: ${curVal}`, value: curVal });
  } else {
    options.unshift({ label: 'Not a mark', value: 'invalid' });
  }
  if (value && !curVal && !options.find((option) => option.value === value)) {
    options.push({ label: value, value });
  }
  return (
    <WriteInContainer key={value} color="primary">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            margin: '-.25rem 0 .5rem 0',
          }}
        >
          <Button
            onPress={() => onChange('invalid')}
            icon="CircleDot"
            style={{ border: 'none', color: 'hsl(262,53%,41%)', padding: 0 }}
          />
          {!value && 'Unadjudicated '}Write-in
        </span>
        <SearchSelect
          onChange={(val) => {
            onChange(val);
            setCurVal('');
          }}
          isMulti={false}
          options={options}
          placeholder="Select existing or add..."
          style={{ width: '100%', paddingLeft: '1.25rem' }}
          onInputChange={onKeyPress}
          value={value}
        />
      </div>
    </WriteInContainer>
  );
}
