import { ElectionDefinition, hasSplits } from '@votingworks/types';
import {
  Button,
  H3,
  H4,
  RadioGroup,
  SearchSelect,
  SegmentedButton,
} from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

// const Row = styled.div`
//   display: flex;
//   flex-wrap: nowrap;
//   gap: 0.5rem;
// `;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Container = styled.div`
  height: calc(100vh - 4rem);
  width: 100%;
  overflow-y: hidden;
  display: flex;
  gap: 1rem;
  padding: 2rem;
  padding-bottom: 0;
  flex-direction: column;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;

  display: flex;
  justify-content: space-between;
`;

const PrintFooter = styled.div`
  height: 5.5rem;
  flex-shrink: 0;

  position: sticky;
  bottom: 0;

  background-color: ${(p) => p.theme.colors.background};
  border-top: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.outline};

  display: flex;
  align-items: center;
  justify-content: space-between;

  // gap: 2rem;
  padding: 0.5rem 2rem;
`;

const CopiesBar = styled.div`
  width: 2.25rem;
  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  gap: 1rem;
  height: 100%;

  color: ${(p) => p.theme.colors.onBackgroundMuted};

  div {
    font-size: 1.75rem;
    font-weight: 700;
    color: ${(p) => p.theme.colors.onBackground};
  }
`;

const CopiesButton = styled(Button)`
  background-color: none;
  border: none;
  padding: 0;

  font-size: 1.75rem;
  font-weight: 500;
`;

export function PrintScreenV2({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}): JSX.Element | null {
  const { election } = electionDefinition;
  const precincts = election.precincts || [];
  const [numCopies, setNumCopies] = React.useState(1);

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
  const [isAbsentee, setIsAbsentee] = React.useState<boolean>(false);

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

  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];

  return (
    <Container>
      <ContentArea>
        <Column style={{ width: '40%' }}>
          <Section>
            <H3>Precinct</H3>
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
            />
          </Section>
        </Column>
        <Column style={{ width: '40%', gap: '2rem', justifySelf: 'end' }}>
          {availableSplits.length > 0 && (
            <Section>
              <H3>Split</H3>
              <RadioGroup
                value={selectedSplitId}
                hideLabel
                label="Split"
                options={availableSplits.map((split) => ({
                  label: split.name,
                  value: split.id,
                }))}
                onChange={(value: string) =>
                  setSelectedSplitId(
                    value === selectedSplitId ? undefined : value
                  )
                }
              />
            </Section>
          )}
          <Section>
            <H3>Party</H3>
            <RadioGroup
              value={selectedParty}
              hideLabel
              label="Party"
              options={parties.map((party) => ({ label: party, value: party }))}
              onChange={(value: string) =>
                setSelectedParty(value === selectedParty ? undefined : value)
              }
            />
          </Section>
          <Section>
            <H3>Language</H3>
            <RadioGroup
              hideLabel
              label="Language"
              options={languages.map((language) => ({
                label: language,
                value: language,
              }))}
              value={selectedLanguage}
              onChange={(value: string) => {
                console.log(value);
                setSelectedLanguage(
                  value === selectedLanguage ? undefined : value
                );
              }}
            />
          </Section>
        </Column>
      </ContentArea>
      <PrintFooter>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            // gap: '2px',
          }}
        >
          <H4>Copies</H4>
          <CopiesBar>
            <CopiesButton
              onPress={() => setNumCopies((prev) => (prev > 1 ? prev - 1 : 1))}
            >
              –
            </CopiesButton>
            <div>{numCopies}</div>
            <CopiesButton
              color="neutral"
              onPress={() => setNumCopies((prev) => prev + 1)}
            >
              +
            </CopiesButton>
          </CopiesBar>
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <SegmentedButton
            label=""
            onChange={(newValue) => {
              setIsAbsentee(newValue === 'absentee');
            }}
            selectedOptionId={isAbsentee ? 'absentee' : 'precinct'}
            options={[
              { label: 'Precinct', id: 'precinct' },
              { label: 'Absentee', id: 'absentee' },
            ]}
          />
        </div>
        <Button
          onPress={() => console.log('TODO: Print Ballots')}
          icon="Print"
          color="primary"
          fill="filled"
          style={{ width: '12rem' }}
        >
          Print
        </Button>
      </PrintFooter>
    </Container>
  );
}
