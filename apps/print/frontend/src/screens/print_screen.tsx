import {
  ElectionDefinition,
  hasSplits,
  PrecinctOrSplitId,
} from '@votingworks/types';
import { H2, SearchSelect, SegmentedButton } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import { BallotStyleCard } from '../components/ballot_style_card';

const Container = styled.div`
  height: calc(100vh - 4rem);
  width: 100%;
  overflow: hidden;
  display: flex;
  gap: 1rem;
  padding: 1rem;
`;

const FilterBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;

  background-color: ${(p) => p.theme.colors.container}; // none;
  // ${(p) => p.theme.colors.background};
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;

  height: 15rem;
  width: 16rem;
  flex-shrink: 0;
`;

const OptionsList = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  height: 1040px;
  padding-right: 0.5rem;
`;

export function PrintScreen({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}): JSX.Element | null {
  const { election } = electionDefinition;
  const precincts = election.precincts || [];
  const [selectedPrecinct, setSelectedPrecinct] = React.useState<
    string | undefined
  >();
  const [isAbsentee, setIsAbsentee] = React.useState<boolean>(false);

  const allPrecinctsOrSplits: Array<
    PrecinctOrSplitId & { precinctName: string }
  > = precincts.flatMap((precinct) => {
    if (hasSplits(precinct)) {
      return precinct.splits.map((split) => ({
        precinctId: split.id,
        precinctName: split.name,
      }));
    }
    return { precinctId: precinct.id, precinctName: precinct.name };
  });

  const filteredPrecincts = selectedPrecinct
    ? allPrecinctsOrSplits.filter((p) => p.precinctName === selectedPrecinct)
    : allPrecinctsOrSplits;

  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];

  return (
    <Container>
      <FilterBox>
        <H2>Precinct</H2>
        <SearchSelect
          placeholder="Find precinct"
          options={[
            {
              label: 'All',
              value: 'all',
            },
          ].concat(
            allPrecinctsOrSplits.map((precinct) => ({
              label: precinct.precinctName,
              value: precinct.precinctName,
            }))
          )}
          value={selectedPrecinct}
          onChange={(value) => {
            setSelectedPrecinct(value === 'all' ? undefined : value);
          }}
        />
        <H2 style={{ marginTop: '1rem' }}>Type</H2>
        <SegmentedButton
          label=""
          onChange={(newValue) => {
            setIsAbsentee(newValue === 'absentee');
          }}
          selectedOptionId={isAbsentee ? 'absentee' : 'precinct'}
          options={[
            { label: 'In-Person', id: 'precinct' },
            { label: 'Absentee', id: 'absentee' },
          ]}
        />
      </FilterBox>
      <OptionsList>
        {filteredPrecincts.map((precinct) =>
          parties.map((party) =>
            languages.map((language) => (
              <BallotStyleCard
                key={precinct.precinctName + party + language}
                precinctName={precinct.precinctName}
                party={party}
                language={language}
              />
            ))
          )
        )}
      </OptionsList>
    </Container>
  );
}
