import { ElectionDefinition, hasSplits } from '@votingworks/types';
import { DesktopPalette, H2, H3, SearchSelect } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import { BallotStyleCard } from '../components/ballot_style_card';

const Container = styled.div`
  height: calc(100vh - 4rem);
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  flex-direction: row-reverse;
`;

const Step1Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  padding-top: 2rem;

  border-left: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};

  height: 100%;
  width: 22rem;
  flex-shrink: 0;
`;

const Step2Section = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  height: 1080px;

  // padding: 1rem;
  padding-bottom: 0rem;
`;

const Toggle = styled.button`
  background: ${(p) => p.theme.colors.background};
  border-radius: 0.25rem;
  border: 1px solid '#999';
  color: '#666';
  cursor: pointer;
  outline-offset: 2px;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  padding: 0.5rem;
  position: relative;
  transition: 120ms ease-out;
  transition-property: background-color, border, color, outline-offset;
  width: 13rem;
  text-align: center;

  :focus,
  :hover {
    background-color: ${DesktopPalette.Purple10};
    color: #000;
  }

  :active,
  &[aria-selected='true'] {
    background-color: ${DesktopPalette.Purple20};
    color: #000;
    outline-offset: 0;
  }
`;

const Section = styled.div`
  display: flex;
  // flex-direction: column;
  gap: 1rem;
  justify-content: space-between;
`;

const ToggleList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
`;

const Badge = styled.div`
  background-color: ${(p) => p.theme.colors.containerLow};
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-radius: 1rem;
  padding: 0.5rem 1rem;
  font-weight: 500;
  font-size: 0.875rem;
  height: 2rem;

  display: flex;
  align-items: center;
  justify-content: center;
`;

export function PrintScreen({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}): JSX.Element | null {
  const { election } = electionDefinition;
  const precincts = election.precincts || [];

  const [selectedPrecinctId, setSelectedPrecinctId] = React.useState<
    string | undefined
  >();
  const [selectedSplitId, setSelectedSplitId] = React.useState<
    string | undefined
  >();
  const [selectedParty, setSelectedParty] = React.useState<
    string | undefined
  >();
  const [selectedLanguage, setSelectedLanguage] = React.useState<
    string | undefined
  >('English');
  const [selectedType, setSelectedType] = React.useState<string | undefined>();

  // Get the selected precinct object
  const selectedPrecinct = selectedPrecinctId
    ? precincts.find((p) => p.id === selectedPrecinctId)
    : undefined;

  // Get available splits for the selected precinct
  const availableSplits =
    selectedPrecinct && hasSplits(selectedPrecinct)
      ? selectedPrecinct.splits
      : [];

  // Clear split selection when precinct changes
  React.useEffect(() => {
    setSelectedSplitId(undefined);
  }, [selectedPrecinctId]);

  const filteredPrecincts = selectedPrecinct
    ? precincts.filter((p) => p.name === selectedPrecinct.name)
    : precincts;

  const filteredPrecinctsWithSplits = filteredPrecincts.flatMap((precinct) => {
    if (hasSplits(precinct)) {
      if (selectedSplitId) {
        return precinct.splits
          .filter((split) => split.id === selectedSplitId)
          .map((split) => ({
            ...precinct,
            name: split.name,
          }));
      }
      return precinct.splits.map((split) => ({
        ...precinct,
        name: split.name,
      }));
    }
    return [
      {
        ...precinct,
        splits: [] as const,
      },
    ];
  });

  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];
  const types = ['Precinct', 'Absentee'];

  const filteredParties = selectedParty
    ? parties.filter((p) => p === selectedParty)
    : parties;

  const filteredLanguages = selectedLanguage
    ? languages.filter((l) => l === selectedLanguage)
    : languages;

  const filteredTypes = selectedType ? [selectedType] : types;

  const numBallots =
    filteredPrecincts.length *
    filteredLanguages.length *
    filteredParties.length *
    filteredTypes.length;

  return (
    <Container>
      <Step1Section>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Filter ballots</H2>
          <Badge>
            {numBallots} {numBallots === 1 ? 'Ballot Style' : 'Ballot Styles'}
          </Badge>
        </Row>
        <SearchSelect
          placeholder="Find precinct"
          options={[
            {
              label: 'All',
              value: 'all',
            },
          ].concat(
            precincts.map((precinct) => ({
              label: precinct.name,
              value: precinct.id,
            }))
          )}
          value={selectedPrecinctId}
          onChange={(value) => {
            setSelectedPrecinctId(value === 'all' ? undefined : value);
          }}
          style={{ marginBottom: '1rem' }}
        />
        {availableSplits.length > 0 && (
          <Section>
            <H3>Split</H3>
            <ToggleList>
              {availableSplits.map((split) => (
                <Toggle
                  // style={{ width: '14rem' }}
                  aria-selected={selectedSplitId === split.id}
                  key={split.id}
                  onClick={() =>
                    setSelectedSplitId(
                      selectedSplitId === split.id ? undefined : split.id
                    )
                  }
                >
                  {split.name}
                </Toggle>
              ))}
            </ToggleList>
          </Section>
        )}
        <Section>
          <H3>Type</H3>
          <ToggleList>
            <Toggle
              aria-selected={selectedType === 'Precinct'}
              key="precinct"
              onClick={() =>
                setSelectedType(
                  selectedType === 'Precinct' ? undefined : 'Precinct'
                )
              }
            >
              Precinct
            </Toggle>
            <Toggle
              aria-selected={selectedType === 'Absentee'}
              key="absentee"
              onClick={() =>
                setSelectedType(
                  selectedType === 'Absentee' ? undefined : 'Absentee'
                )
              }
            >
              Absentee
            </Toggle>
          </ToggleList>
        </Section>
        <Section>
          <H3>Party</H3>
          {/* <ToggleList> */}
          <ToggleList>
            {parties.map((party) => (
              <Toggle
                aria-selected={party === selectedParty}
                key={party}
                onClick={() =>
                  setSelectedParty(party === selectedParty ? undefined : party)
                }
              >
                {party}
              </Toggle>
            ))}
          </ToggleList>
          {/* </ToggleList> */}
        </Section>
        <Section>
          <H3>Language</H3>
          <ToggleList>
            {languages.map((language) => (
              <Toggle
                aria-selected={language === selectedLanguage}
                key={language}
                onClick={() =>
                  setSelectedLanguage(
                    language === selectedLanguage ? undefined : language
                  )
                }
              >
                {language}
              </Toggle>
            ))}
          </ToggleList>
        </Section>
        {/* <Button
          icon="X"
          onPress={() => {
            setSelectedPrecinct(undefined);
            setSelectedParty(undefined);
            setSelectedLanguage(undefined);
            setSelectedType(undefined);
          }}
          value={undefined}
          fill="outlined"
          style={{ marginTop: 'auto', marginBottom: '1rem' }}
        >
          Clear
        </Button> */}
      </Step1Section>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: '1',
          marginRight: '1rem',
          paddingRight: '1rem',
          marginLeft: '1rem',
          marginTop: '2rem',
        }}
      >
        <Step2Section>
          {filteredPrecinctsWithSplits.map((precinct) =>
            filteredParties.map((party) =>
              filteredLanguages.map((language) => (
                  <Row
                    style={{
                      justifyContent: 'space-around',
                      marginBottom: '2rem',
                    }}
                    key={precinct.name + party + language}
                  >
                    {filteredTypes.includes('Precinct') && (
                      <BallotStyleCard
                        key={`${precinct.name + party + language  }Precinct`}
                        precinctName={precinct.name}
                        party={party}
                        language={language}
                        type="Precinct"
                      />
                    )}
                    {filteredTypes.includes('Absentee') && (
                      <BallotStyleCard
                        key={`${precinct.name + party + language  }Absentee`}
                        precinctName={precinct.name}
                        party={party}
                        language={language}
                        type="Absentee"
                      />
                    )}
                  </Row>
                ))
            )
          )}
        </Step2Section>
      </div>
    </Container>
  );
}
