import { useState } from 'react';
import styled from 'styled-components';

import { format } from '@votingworks/utils';
import { BallotType, hasSplits, LanguageCode } from '@votingworks/types';
import {
  Button,
  RadioGroup,
  SegmentedButton,
  NumberInput,
} from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';

import { ExpandedSelect } from '../components/expanded_select';
import { TitleBar } from '../components/title_bar';
import { getElectionRecord, printBallot } from '../api';
import { getAvailableLanguages } from '../utils';

const Container = styled.div`
  /* Adjusted for Toolbar height */
  height: calc(100vh - 2.2rem);
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
  overflow-y: hidden;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  padding: 1rem;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: hidden;
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: hidden;
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
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(
    LanguageCode.ENGLISH
  );
  const [isAbsentee, setIsAbsentee] = useState<boolean>(false);
  const printBallotMutation = printBallot.useMutation();

  const getElectionRecordQuery = getElectionRecord.useQuery();
  if (!getElectionRecordQuery.isSuccess) {
    return null;
  }

  const {
    electionDefinition: { election },
  } = assertDefined(getElectionRecordQuery.data);
  const languages = getAvailableLanguages(election);
  const { precincts, parties } = election;
  const hasParties = election.type === 'primary';

  const selectedPrecinct = selectedPrecinctName
    ? precincts.find((p) => p.name === selectedPrecinctName)
    : undefined;
  const selectedSplitId =
    selectedPrecinct && hasSplits(selectedPrecinct) && selectedSplitName
      ? selectedPrecinct.splits.find((s) => s.name === selectedSplitName)?.id
      : undefined;
  const selectedPartyId = parties.find(
    (party) => party.abbrev === selectedParty
  )?.id;

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
          <FormSection style={{ flex: 1 }}>
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
                if (value !== selectedPrecinctName) {
                  setSelectedPrecinctName(value);
                  setSelectedSplitName('');
                }
              }}
            />
          </FormSection>
          {showSplitSelection && (
            <FormSection>
              <strong style={{ marginBottom: '0.25rem' }}>Split</strong>
              <ExpandedSelect
                selectedValue={selectedSplitName}
                options={availableSplits.map((split) => split.name)}
                onSelect={(value) => {
                  setSelectedSplitName(value);
                }}
              />
            </FormSection>
          )}
        </Column>
        <Column>
          {hasParties && (
            <FormSection>
              <strong>Party</strong>
              <RadioGroup
                label="Party"
                value={selectedParty}
                options={parties.map((party) => ({
                  label: party.name,
                  value: party.abbrev,
                }))}
                onChange={(value: string) => setSelectedParty(value)}
                hideLabel
              />
            </FormSection>
          )}
          <FormSection>
            <strong>Language</strong>
            <RadioGroup
              label="Language"
              value={selectedLanguage}
              options={languages.map((language) => ({
                label: format.languageDisplayName({
                  languageCode: language,
                  displayLanguageCode: 'en',
                }),
                value: language,
              }))}
              onChange={(value: LanguageCode) => {
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
            style={{ width: '3rem' }}
          />
        </FooterSection>
        <PrintButton
          icon="Print"
          color="primary"
          fill="filled"
          onPress={() => {
            printBallotMutation.mutate({
              precinctId: assertDefined(selectedPrecinct).id,
              splitId: selectedSplitId,
              partyId: selectedPartyId,
              languageCode: selectedLanguage,
              ballotType: isAbsentee
                ? BallotType.Absentee
                : BallotType.Precinct,
              copies: numCopies,
            });
            console.log(
              `Printing ballot style: ${selectedPrecinctName}, ${selectedParty}, ${selectedLanguage}${
                selectedSplitName ? `, ${selectedSplitName}` : ''
              }, ${isAbsentee ? 'Absentee' : 'Precinct'}, Copies: ${numCopies} `
            );
          }}
          disabled={
            !selectedPrecinctName ||
            !selectedLanguage ||
            (hasParties && !selectedParty) ||
            (availableSplits.length > 0 && !selectedSplitName)
          }
        >
          Print Ballot
        </PrintButton>
      </Footer>
    </Container>
  );
}
