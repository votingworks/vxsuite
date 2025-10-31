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

  padding-bottom: 0;
  flex-direction: column;
`;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;

  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  padding: 1rem;
`;

const StyledSegmentedButton = styled(SegmentedButton)`
  // height: 70px;
  margin-bottom: 0.75rem;
`;

const PrintAllButton = styled(Button)`
  width: 12rem;
  margin-right: auto;
  padding-left: 1rem;
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
  const [selectedSplitId, setSelectedSplitId] = useState<string | undefined>();
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

  // Clear split selection when precinct changes
  useEffect(() => {
    setSelectedSplitId(undefined);
  }, [selectedPrecinctName]);

  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];

  return (
    <Container>
      <ContentArea>
        <Column>
          <Section>
            <strong>Precinct</strong>
            <ExpandedSearch
              searchResults={precincts
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
                setSelectedSplitId(undefined);
                setSelectedParty(undefined);
              }}
            />
          </Section>
        </Column>
        <Column>
          {availableSplits.length > 0 && (
            <Section>
              <strong>Split</strong>
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
          <Section>
            <strong style={{ marginBottom: 0 }}>Ballot Type</strong>
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
          </Section>
        </Column>
      </ContentArea>
      <PrintFooter>
        <PrintAllButton
          color="neutral"
          fill="outlined"
          onPress={() => console.log('Print all ballot styles')}
        >
          Print All Ballot Styles
        </PrintAllButton>
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
                selectedSplitId ? `, ${selectedSplitId}` : ''
              }`
            )
          }
          disabled={
            !selectedPrecinctName ||
            !selectedLanguage ||
            !selectedParty ||
            (availableSplits.length > 0 && !selectedSplitId)
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
