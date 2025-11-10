import { useState } from 'react';
import styled from 'styled-components';

import { hasSplits, Precinct } from '@votingworks/types';
import { Button, RadioGroup, SegmentedButton } from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';

import { ExpandedSelect } from '../components/expanded_select';
import { NumberInput } from '../components/number_input';
import { TitleBar } from '../components/title_bar';
import { getElectionDefinition } from '../api';

const Container = styled.div`
  /* Adjusted for Toolbar height */
  height: calc(100vh - 2rem);
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  padding-bottom: 0;
`;

const Form = styled.div`
  /* Adjusted for Toolbar, TitleBar, and Footer heights */
  height: calc(100% - 4rem - 2rem - 4rem);
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  padding: 1rem;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
`;

const Footer = styled.div`
  position: sticky;
  bottom: 0;
  height: 4rem;
  padding: 0.5rem 1rem;
  flex-shrink: 0;
  background-color: ${(p) => p.theme.colors.container};
  border-top: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 1rem;
`;

const FooterSection = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;

const PrintButton = styled(Button)`
  width: 14rem;
  height: 3rem;
  font-size: 1.1rem;
`;

const PrintAllButton = styled(Button)`
  width: 12rem;
`;

export function PrintScreen({
  isElectionManagerAuth,
}: {
  isElectionManagerAuth: boolean;
}): JSX.Element | null {
  const [numCopies, setNumCopies] = useState(1);
  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedPrecinctName, setSelectedPrecinctName] = useState<string>('');
  const [selectedSplitName, setSelectedSplitName] = useState<string>('');
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
  const [isAbsentee, setIsAbsentee] = useState<boolean>(false);

  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  if (!getElectionDefinitionQuery.isSuccess) {
    return null;
  }

  const {election} = assertDefined(getElectionDefinitionQuery.data);
  const precincts: readonly Precinct[] = election?.precincts || [];
  // TODO(Nikhil): Hook up to real data
  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];

  const selectedPrecinct = selectedPrecinctName
    ? precincts.find((p) => p.name === selectedPrecinctName)
    : undefined;

  const availableSplits =
    selectedPrecinct && hasSplits(selectedPrecinct)
      ? selectedPrecinct.splits
      : [];
  const showSplitSelection = availableSplits.length > 0;

  return (
    <Container>
      <TitleBar
        title="Print"
        actions={
          isElectionManagerAuth ? (
            <PrintAllButton
              color="neutral"
              fill="outlined"
              onPress={() => console.log('Print all ballot styles')}
            >
              Print All Ballot Styles
            </PrintAllButton>
          ) : undefined
        }
      />
      <Form>
        <Column>
          <FormSection style={{ flex: 1.2 }}>
            <strong>Precinct</strong>
            <ExpandedSelect
              selectedValue={selectedPrecinctName}
              options={precincts
                .map((p) => p.name)
                .filter(
                  (name) =>
                    !searchValue ||
                    name.toLowerCase().includes(searchValue.toLowerCase())
                )}
              onSearch={setSearchValue}
              onSelect={(value) => {
                setSelectedPrecinctName(value);
                setSelectedSplitName('');
                setSelectedParty('');
              }}
            />
          </FormSection>
          {showSplitSelection && (
            <FormSection style={{ flex: 1 }}>
              <strong style={{ marginBottom: '0.25rem' }}>Split</strong>
              <ExpandedSelect
                selectedValue={selectedSplitName}
                options={availableSplits
                  .map((split) => split.name)
                  .filter(
                    (name) =>
                      !searchValue ||
                      name.toLowerCase().includes(searchValue.toLowerCase())
                  )}
                onSelect={(value) => {
                  setSelectedSplitName(value);
                }}
              />
            </FormSection>
          )}
        </Column>
        <Column>
          <FormSection>
            <strong>Party</strong>
            <RadioGroup
              label="Party"
              value={selectedParty}
              options={parties.map((party) => ({ label: party, value: party }))}
              onChange={(value: string) => setSelectedParty(value)}
              hideLabel
            />
          </FormSection>
          <FormSection>
            <strong>Language</strong>
            <RadioGroup
              label="Language"
              value={selectedLanguage}
              options={languages.map((language) => ({
                label: language,
                value: language,
              }))}
              onChange={(value: string) => {
                setSelectedLanguage(value);
              }}
              hideLabel
            />
          </FormSection>
        </Column>
      </Form>
      <Footer>
        {isElectionManagerAuth && (
          <FooterSection style={{ marginRight: 'auto' }}>
            <strong>Ballot Type:</strong>
            <SegmentedButton
              label="Precinct or Absentee"
              selectedOptionId={isAbsentee ? 'absentee' : 'precinct'}
              options={[
                { label: 'Precinct', id: 'precinct' },
                { label: 'Absentee', id: 'absentee' },
              ]}
              onChange={(newValue) => {
                setIsAbsentee(newValue === 'absentee');
              }}
              hideLabel
            />
          </FooterSection>
        )}
        <FooterSection>
          <strong>Copies:</strong>
          <NumberInput
            value={numCopies}
            onChange={(value) => setNumCopies(value || 0)}
          />
        </FooterSection>
        <PrintButton
          icon="Print"
          color="primary"
          fill="filled"
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
        >
          Print Ballot
        </PrintButton>
      </Footer>
    </Container>
  );
}
