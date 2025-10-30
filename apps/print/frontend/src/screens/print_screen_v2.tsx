import { ElectionDefinition, hasSplits } from '@votingworks/types';
import { Button, H3, H6, RadioGroup, SegmentedButton } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import {
  ExpandedSearch,
  Option,
  SideBar,
  StringSnippets,
} from '../components/expanded_search';
import { NumberInput } from '../components/number_input';

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
  padding-bottom: 0;
  flex-direction: column;
`;

// const HeaderBar = styled.div`
//   height: 4rem;
//   flex-shrink: 0;
//   border-bottom: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
//     ${(p) => p.theme.colors.outline};
//   background-color: ${(p) => p.theme.colors.containerLow};

//   display: flex;
//   align-items: center;
//   justify-content: flex-end;
//   padding-right: 2rem;
// `;

const ContentArea = styled.div`
  flex: 1;
  overflow-y: auto;

  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  padding: 1rem;
`;

const PrintAllContainer = styled.div`
  margin-right: auto;
  // border-right: 1px solid ${(p) => p.theme.colors.outline};
  // padding: 0.5rem 1.5rem 0.5rem 0;

  // margin-top: auto;
`;

const StyledSegmentedButton = styled(SegmentedButton)`
  // height: 70px;
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

const CopiesBar = styled.div`
  // width: 2.25rem;
  flex-shrink: 0;

  display: flex;
  align-items: center;
  justify-content: start;
  gap: 1rem;

  color: ${(p) => p.theme.colors.onBackgroundMuted};

  div {
    font-size: 1.75rem;
    font-weight: 700;
    color: ${(p) => p.theme.colors.onBackground};
  }
`;

export function PrintScreenV2({
  electionDefinition,
}: {
  electionDefinition: ElectionDefinition;
}): JSX.Element | null {
  const { election } = electionDefinition;
  const precincts = election.precincts || [];
  const [numCopies, setNumCopies] = React.useState(1);

  const [searchValue, setSearchValue] = React.useState<string>('');
  const [selectedPrecinctName, setSelectedPrecinctName] =
    React.useState<string>('');
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
  const selectedPrecinct = selectedPrecinctName
    ? precincts.find((p) => p.name === selectedPrecinctName)
    : undefined;

  // Get available splits for the selected precinct
  const availableSplits =
    selectedPrecinct && hasSplits(selectedPrecinct)
      ? selectedPrecinct.splits
      : [];

  // Clear split selection when precinct changes
  React.useEffect(() => {
    setSelectedSplitId(undefined);
  }, [selectedPrecinctName]);

  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];

  return (
    <Container>
      {/* <HeaderBar></HeaderBar> */}
      <ContentArea>
        <Column style={{ gap: '1rem' }}>
          {/* <Section>
            <H3 style={{ marginBottom: 0 }}>Type</H3>
          </Section> */}
          <Section style={{ flex: 1 }}>
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
          {availableSplits.length > 0 && (
            <Section style={{ flex: 1 }}>
              <strong>Split</strong>
              <SideBar>
                <StringSnippets>
                  {availableSplits.map((split) => (
                    <Option
                      key={split.id}
                      name={split.name}
                      iSelected={split.id === selectedSplitId}
                      onClick={() => setSelectedSplitId(split.id)}
                    />
                  ))}
                </StringSnippets>
              </SideBar>
            </Section>
          )}
        </Column>
        <Column style={{ gap: '1rem' }}>
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
                console.log(value);
                setSelectedLanguage(
                  value === selectedLanguage ? undefined : value
                );
              }}
            />
          </Section>
          <Section>
            <StyledSegmentedButton
              label="Ballot Type"
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
        <PrintAllContainer>
          <Button
            color="neutral"
            fill="outlined"
            onPress={() => console.log('Print all ballot styles')}
            style={{ width: '12rem' }}
          >
            Print All Ballot Styles
          </Button>
        </PrintAllContainer>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            // alignSelf: 'start',
            alignItems: 'center',

            gap: '0.5rem',
          }}
        >
          <strong>Copies:</strong>
          <CopiesBar>
            {/* <CopiesButton
              fill="outlined"
              color="neutral"
              onPress={() => setNumCopies((prev) => (prev > 1 ? prev - 1 : 1))}
            >
              –
            </CopiesButton> */}
            <NumberInput
              value={numCopies}
              onChange={(value) => setNumCopies(value || 0)}
            />
            {/* <CopiesButton
              fill="outlined"
              color="neutral"
              onPress={() => setNumCopies((prev) => prev + 1)}
            >
              +
            </CopiesButton> */}
          </CopiesBar>
        </div>
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
