import {
  ElectionDefinition,
  hasSplits,
  PrecinctOrSplitId,
} from '@votingworks/types';
import {
  Button,
  DesktopPalette,
  H2,
  H4,
  SearchSelect,
  SegmentedButton,
} from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

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

const Row = styled.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
`;

const StyleSection = styled.div`
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
  flex-direction: column;
  gap: 1rem;
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

  const [selectedPrecinct, setSelectedPrecinct] = React.useState<
    string | undefined
  >();
  const [selectedParty, setSelectedParty] = React.useState<
    string | undefined
  >();
  const [selectedLanguage, setSelectedLanguage] = React.useState<
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

  const languages = ['English', 'Spanish'];
  const parties = ['Dem', 'Rep'];

  return (
    <Container>
      <ContentArea>
        <StyleSection>
          <H2>Precinct</H2>
          <SearchSelect
            style={{ width: '80%', marginLeft: '0.125rem' }}
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
        </StyleSection>
        <StyleSection>
          <H2>Party</H2>
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
        </StyleSection>
        <StyleSection>
          <H2>Language</H2>
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
        </StyleSection>
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
