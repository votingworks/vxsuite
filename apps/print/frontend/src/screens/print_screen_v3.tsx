import {
  ElectionDefinition,
  hasSplits,
  PrecinctOrSplitId,
} from '@votingworks/types';
import { DesktopPalette, H2, H3, SearchSelect } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import { BallotStyleCard } from '../components/ballot_style_card';

const Container = styled.div`
  height: calc(100vh - 4rem);
  width: 100%;
  overflow: hidden;
  display: flex;
  // gap: 1rem;
  // margin: 1rem;
  align-items: stretch;
`;

const Step1Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;

  border-right: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};

  height: 100%;
  width: 18rem;
  flex-shrink: 0;
`;

const Step2Section = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  height: 1080px;

  padding: 1rem;
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
  width: 12rem;

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
  flex-direction: column;
  gap: 0.5rem;
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

export function PrintScreenV3({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}): JSX.Element | null {
  const { election } = electionDefinition;
  const precincts = election.precincts || [];

  const [selectedPrecinct, setSelectedPrecinct] = React.useState<
    string | undefined
  >();
  const [selectedParty, setSelectedParty] = React.useState<
    string | undefined
  >();
  const [selectedLanguage, setSelectedLanguage] = React.useState<
    string | undefined
  >();
  const [selectedType, setSelectedType] = React.useState<string | undefined>();

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
        <H2>Step 1 – Filter</H2>
        <H3>Precinct</H3>
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
        <Section>
          <H3>Type</H3>
          <Row>
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
          </Row>
        </Section>
        <Section>
          <H3>Party</H3>
          <Row>
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
          </Row>
        </Section>
        <Section>
          <H3>Language</H3>
          <Row>
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
          </Row>
        </Section>
      </Step1Section>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: '1',
        }}
      >
        <Row style={{ alignItems: 'center' }}>
          <H2 style={{ margin: '1rem' }}>Step 2 – Print</H2>
          <Badge>
            From {numBallots}{' '}
            {numBallots === 1 ? 'Ballot Style' : 'Ballot Styles'}
          </Badge>
        </Row>
        <Step2Section>
          {filteredPrecincts.map((precinct) =>
            filteredParties.map((party) =>
              filteredLanguages.map((language) =>
                filteredTypes.map((type) => (
                  <BallotStyleCard
                    key={precinct.precinctName + party + language + type}
                    precinctName={precinct.precinctName}
                    party={party}
                    language={language}
                    type={type}
                  />
                ))
              )
            )
          )}
        </Step2Section>
      </div>
    </Container>
  );
}
