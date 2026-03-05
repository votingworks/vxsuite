/* istanbul ignore file - @preserve */
import React from 'react';
import styled from 'styled-components';
import {
  Card,
  ContestChoiceButton,
  H1,
  H3,
  Main,
  P,
  Screen,
  VoterContestSummary,
  VxThemeProvider,
} from '@votingworks/ui';

const Content = styled.div`
  padding: 1.5rem;
  overflow-y: auto;
  max-height: 100vh;
`;

const Row = styled.div`
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const Column = styled.div`
  flex: 1;
  min-width: 1200px;
  max-width: 1800px;
`;

const ColumnHeader = styled(H3)`
  font-size: 0.85rem;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  margin: 0 0 0.5rem;
`;

const Section = styled.div`
  margin-bottom: 2rem;
`;

const ThemeBox = styled.div`
  background-color: ${(p) => p.theme.colors.background};
  color: ${(p) => p.theme.colors.onBackground};
  border: 1px solid ${(p) => p.theme.colors.outline};
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
`;

const PARTY = 'Democrat';

// --- Candidate contest buttons (variant D) ---

function DirectCandidateButton({ name }: { name: string }): JSX.Element {
  return (
    <ContestChoiceButton
      choice={name}
      isSelected
      label={name}
      caption={PARTY}
      onPress={() => {}}
    />
  );
}

function UnselectedCandidateButton({
  name,
  party,
}: {
  name: string;
  party: string;
}): JSX.Element {
  return (
    <ContestChoiceButton
      choice={name}
      label={name}
      caption={party}
      onPress={() => {}}
    />
  );
}

function IndirectCandidateButton({ name }: { name: string }): JSX.Element {
  return (
    <ContestChoiceButton
      choice={name}
      isDerived
      label={name}
      caption={`${PARTY} - Straight party vote`}
      onPress={() => {}}
    />
  );
}

function ContestDemo(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <DirectCandidateButton name="Alice Smith" />
      <IndirectCandidateButton name="Bob Jones" />
      <IndirectCandidateButton name="Carol Davis" />
      <UnselectedCandidateButton name="Dan Wilson" party="Republican" />
    </div>
  );
}

// A: "Democrat — Straight Party" (current, em dash + capitalized)
function ReviewAnnotationA(): JSX.Element {
  return (
    <Card>
      <VoterContestSummary
        districtName="District 5"
        title="City Council"
        titleType="h2"
        votes={[
          { id: '1', label: 'Alice Smith', caption: PARTY },
          {
            id: '2',
            isDerived: true,
            label: 'Bob Jones',
            caption: <React.Fragment>{PARTY} — Straight Party</React.Fragment>,
          },
          {
            id: '3',
            isDerived: true,
            label: 'Carol Davis',
            caption: <React.Fragment>{PARTY} — Straight Party</React.Fragment>,
          },
        ]}
      />
    </Card>
  );
}

// B: "Democrat (Straight Party)"
function ReviewAnnotationB(): JSX.Element {
  return (
    <Card>
      <VoterContestSummary
        districtName="District 5"
        title="City Council"
        titleType="h2"
        votes={[
          { id: '1', label: 'Alice Smith', caption: PARTY },
          {
            id: '2',
            isDerived: true,
            label: 'Bob Jones',
            caption: `${PARTY} (Straight Party)`,
          },
          {
            id: '3',
            isDerived: true,
            label: 'Carol Davis',
            caption: `${PARTY} (Straight Party)`,
          },
        ]}
      />
    </Card>
  );
}

// C: "Straight party vote applied: Democrat" outside as separate line
const OutsideReviewAnnotation = styled.div`
  font-size: 0.75rem;
  font-weight: 400;
  margin: -0.1rem 0 0.35rem 1.4rem;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
`;

function ReviewAnnotationC(): JSX.Element {
  return (
    <Card>
      <VoterContestSummary
        districtName="District 5"
        title="City Council"
        titleType="h2"
        votes={[
          { id: '1', label: 'Alice Smith', caption: PARTY },
          { id: '2', isDerived: true, label: 'Bob Jones', caption: PARTY },
          { id: '3', isDerived: true, label: 'Carol Davis', caption: PARTY },
        ]}
      />
      <OutsideReviewAnnotation>
        Straight party vote applied: {PARTY}
      </OutsideReviewAnnotation>
    </Card>
  );
}

// D: "Democrat" on caption line, "Straight party vote" on second line
function ReviewAnnotationD(): JSX.Element {
  return (
    <Card>
      <VoterContestSummary
        districtName="District 5"
        title="City Council"
        titleType="h2"
        votes={[
          { id: '1', label: 'Alice Smith', caption: PARTY },
          {
            id: '2',
            isDerived: true,
            label: 'Bob Jones',
            caption: (
              <React.Fragment>
                {PARTY}
                <br />
                Straight party vote
              </React.Fragment>
            ),
          },
          {
            id: '3',
            isDerived: true,
            label: 'Carol Davis',
            caption: (
              <React.Fragment>
                {PARTY}
                <br />
                Straight party vote
              </React.Fragment>
            ),
          },
        ]}
      />
    </Card>
  );
}

// E: "Democrat - Straight party vote"
function ReviewAnnotationE(): JSX.Element {
  return (
    <Card>
      <VoterContestSummary
        districtName="District 5"
        title="City Council"
        titleType="h2"
        votes={[
          { id: '1', label: 'Alice Smith', caption: PARTY },
          {
            id: '2',
            isDerived: true,
            label: 'Bob Jones',
            caption: `${PARTY} - Straight party vote`,
          },
          {
            id: '3',
            isDerived: true,
            label: 'Carol Davis',
            caption: `${PARTY} - Straight party vote`,
          },
        ]}
      />
    </Card>
  );
}

export function StraightPartyPrototype(): JSX.Element {
  return (
    <Screen>
      <Main>
        <Content>
          <H1 style={{ marginBottom: '0.25rem' }}>
            Straight Party — Review Screen
          </H1>
          <P style={{ margin: '0 0 1rem' }}>
            City Council (3 seats). Alice Smith (Democrat) is a direct vote. Bob
            Jones and Carol Davis (Democrat) are indirect via straight party.
            Direct votes get filled checkbox, indirect get outline.
          </P>

          <Section>
            <VxThemeProvider
              colorMode="contrastMedium"
              sizeMode="touchMedium"
              screenType="elo15"
            >
              <ThemeBox>
                <ColumnHeader>Candidate Contest (for reference)</ColumnHeader>
                <ContestDemo />
              </ThemeBox>
            </VxThemeProvider>
          </Section>

          <Section>
            <VxThemeProvider
              colorMode="contrastMedium"
              sizeMode="touchMedium"
              screenType="elo15"
            >
              <ThemeBox>
                <ColumnHeader>
                  Review Screen — Annotation Variations
                </ColumnHeader>
                <Row>
                  <Column>
                    <ColumnHeader>
                      A — &ldquo;Democrat — Straight Party&rdquo;
                    </ColumnHeader>
                    <ReviewAnnotationA />
                  </Column>
                  <Column>
                    <ColumnHeader>
                      B — &ldquo;Democrat (Straight Party)&rdquo;
                    </ColumnHeader>
                    <ReviewAnnotationB />
                  </Column>
                  <Column>
                    <ColumnHeader>C — Summary below votes</ColumnHeader>
                    <ReviewAnnotationC />
                  </Column>
                  <Column>
                    <ColumnHeader>D — Separate caption line</ColumnHeader>
                    <ReviewAnnotationD />
                  </Column>
                  <Column>
                    <ColumnHeader>
                      E — &ldquo;Democrat - Straight party vote&rdquo;
                    </ColumnHeader>
                    <ReviewAnnotationE />
                  </Column>
                </Row>
              </ThemeBox>
            </VxThemeProvider>
          </Section>
        </Content>
      </Main>
    </Screen>
  );
}
