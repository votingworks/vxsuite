import { ElectionDefinition, hasSplits } from '@votingworks/types';
import { Button, RadioGroup, SegmentedButton } from '@votingworks/ui';
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { ExpandedSearch } from '../components/expanded_search';
import { NumberInput } from '../components/number_input';

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;

  overflow-y: hidden;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  overflow-y: auto;
  max-height: 100%;
`;

const Container = styled.div`
  height: calc(100vh - 4rem - 2rem);
  width: 100%;
  overflow-y: hidden;
  display: flex;

  padding-bottom: 0;
  flex-direction: column;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;
  height: calc(100% - 4rem - 2rem - 4rem);

  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  padding: 1rem;
`;

const CopiesContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

const PrintFooter = styled.div`
  flex-shrink: 0;

  position: sticky;
  bottom: 0;

  background-color: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.outline};

  display: flex;
  align-items: center;
  justify-content: end;

  gap: 1rem;
  padding: 0.5rem 1rem;
`;

const StyledSegmentedButton = styled(SegmentedButton)`
  margin-top: -0.5rem;
`;

export function PrintScreen({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}): JSX.Element | null {
  const { election } = electionDefinition;
  const precincts = election.precincts || [];
  const [numCopies, setNumCopies] = useState(1);

  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedPrecinctName, setSelectedPrecinctName] = useState<string>('');
  const [selectedSplitName, setSelectedSplitName] = useState<string>('');
  const [selectedParty, setSelectedParty] = useState<string | undefined>();
  const [selectedLanguage, setSelectedLanguage] = useState<string | undefined>(
    'English'
  );
  const [isAbsentee, setIsAbsentee] = useState<boolean>(false);

  const selectedPrecinct = selectedPrecinctName
    ? precincts.find((p) => p.name === selectedPrecinctName)
    : undefined;

  const availableSplits =
    selectedPrecinct && hasSplits(selectedPrecinct)
      ? selectedPrecinct.splits
      : [];

  const showSplits = availableSplits.length > 0;

  // Clear split selection when precinct changes
  useEffect(() => {
    setSelectedSplitName('');
  }, [selectedPrecinctName]);

  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];

  return (
    <Container>
      <ContentArea>
        <Column>
          <Section style={{ flex: 1.2 }}>
            <strong>Precinct</strong>
            <ExpandedSearch
              searchResults={precincts
                // .concat(precincts)
                // .concat(precincts)
                .map((p) => p.name)
                .filter(
                  (precinct) =>
                    !searchValue ||
                    precinct.toLowerCase().includes(searchValue.toLowerCase())
                )}
              // searchValue={searchValue}
              selectedValue={selectedPrecinctName}
              onSearch={(value) => {
                setSearchValue(value);
              }}
              onSelect={(value) => {
                setSelectedPrecinctName(value);
                setSelectedSplitName('');
                setSelectedParty(undefined);
              }}
            />
          </Section>
        </Column>
        <Column>
          {showSplits && (
            <Section>
              <strong>Split</strong>
              <RadioGroup
                value={selectedSplitName}
                hideLabel
                label="Split"
                options={availableSplits.map((split) => ({
                  label: split.name,
                  value: split.name,
                }))}
                onChange={(value: string) =>
                  setSelectedSplitName(value === selectedSplitName ? '' : value)
                }
              />
            </Section>
          )}
          <Section>
            <strong>Party</strong>
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
            <strong>Language</strong>
            <RadioGroup
              hideLabel
              label="Language"
              options={languages.map((language) => ({
                label: language,
                value: language,
              }))}
              value={selectedLanguage}
              onChange={(value: string) => {
                setSelectedLanguage(
                  value === selectedLanguage ? undefined : value
                );
              }}
            />
          </Section>
        </Column>
      </ContentArea>
      <PrintFooter>
        <CopiesContainer style={{ marginRight: 'auto' }}>
          <strong>Ballot Type:</strong>
          <StyledSegmentedButton
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
        </CopiesContainer>
        <CopiesContainer>
          <strong>Copies:</strong>
          <NumberInput
            value={numCopies}
            onChange={(value) => setNumCopies(value || 0)}
          />
        </CopiesContainer>
        <Button
          onPress={() =>
            console.log(
              `Printing ballot style: ${selectedPrecinctName}, ${selectedParty}, ${selectedLanguage}${
                selectedSplitName ? `, ${selectedSplitName}` : ''
              }`
            )
          }
          disabled={
            !selectedPrecinctName ||
            !selectedLanguage ||
            !selectedParty ||
            (availableSplits.length > 0 && !selectedSplitName)
          }
          icon="Print"
          color="primary"
          fill="filled"
          style={{ width: '14rem', height: '3rem', fontSize: '1.1rem' }}
        >
          Print Ballot
        </Button>
      </PrintFooter>
    </Container>
  );
}
