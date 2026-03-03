import React from 'react';
import styled from 'styled-components';
import {
  DesktopPalette,
  Font,
  H1,
  H2,
  Icons,
  Main,
  Screen,
} from '@votingworks/ui';

const Content = styled.div`
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Row = styled.div`
  display: flex;
  gap: 2rem;
  align-items: start;
`;

const VariantHeading = styled(H2)`
  font-size: 1rem;
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  margin: 0 0 0.5rem;
`;

/* ── Mock EntityList primitives ──────────────────────────────── */

const ListBox = styled.ul`
  --border: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};

  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;
  width: 22rem;
  border: var(--border);
  border-radius: 0.25rem;
`;

const ListHeader = styled(H2)`
  background-color: ${(p) => p.theme.colors.containerLow};
  border-bottom: var(--border);
  border-bottom-width: ${(p) => p.theme.sizes.bordersRem.medium}rem;
  font-size: 1.25rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 1;
  margin: 0;
  padding: 0.75rem 1rem;
`;

const ListItem = styled.li<{
  hasWarning?: boolean;
}>`
  /* stylelint-disable value-keyword-case */
  align-items: center;
  border-bottom: var(--border);
  cursor: pointer;
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0.5rem 1rem;
  transition: background 100ms ease-out;

  ${(p) => p.hasWarning && `background-color: ${DesktopPalette.Orange5};`}

  :hover {
    background: ${(p) =>
      p.hasWarning
        ? p.theme.colors.warningContainer
        : p.theme.colors.containerLow};
    box-shadow: inset 0.25rem 0 0
      ${(p) =>
        p.hasWarning ? DesktopPalette.Orange30 : DesktopPalette.Purple50};
  }
`;

const ItemColumn = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 0;
`;

const ItemCaption = styled(Font)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 0.75rem;
`;

const ItemLabel = styled(Font)`
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

/* ── Variant-specific styled components ──────────────────────── */

const SpCaptionNeutral = styled(Font)`
  color: ${(p) => p.theme.colors.onBackground};
  font-size: 0.75rem;
`;

/* ── Mock contest data ──────────────────────────────────────── */

interface MockContest {
  id: string;
  district: string;
  title: string;
  hasWarning: boolean;
  isSp: boolean;
}

const MOCK_CONTESTS: MockContest[] = [
  {
    id: 'sp',
    district: 'State of Michigan',
    title: 'Straight Party',
    hasWarning: true,
    isSp: true,
  },
  {
    id: 'president',
    district: 'United States',
    title: 'President and Vice President',
    hasWarning: false,
    isSp: false,
  },
  {
    id: 'senator',
    district: 'State of Michigan',
    title: 'U.S. Senator',
    hasWarning: true,
    isSp: false,
  },
  {
    id: 'governor',
    district: 'State of Michigan',
    title: 'Governor',
    hasWarning: false,
    isSp: false,
  },
  {
    id: 'proposal-1',
    district: 'State of Michigan',
    title: 'Proposal 1',
    hasWarning: false,
    isSp: false,
  },
  {
    id: 'school-board',
    district: 'Schoolcraft ISD',
    title: 'Board of Education',
    hasWarning: false,
    isSp: false,
  },
];

/* ── Shared contest list rendering ─────────────────────────── */

function ContestList({
  spAnnotation,
}: {
  spAnnotation: React.ReactNode;
}): JSX.Element {
  return (
    <ListBox>
      <ListHeader>Front</ListHeader>
      {MOCK_CONTESTS.map((contest) => (
        <ListItem key={contest.id} hasWarning={contest.hasWarning}>
          <ItemColumn>
            <ItemCaption>{contest.district}</ItemCaption>
            <ItemLabel weight="semiBold" style={{ marginBottom: '0.25rem' }}>
              {contest.title}
            </ItemLabel>
            {contest.isSp && spAnnotation}
          </ItemColumn>
          {contest.hasWarning && <Icons.Warning color="warning" />}
        </ListItem>
      ))}
    </ListBox>
  );
}

/* ── Single variant: Neutral caption with party ── */

function VariantA(): JSX.Element {
  return (
    <div>
      <VariantHeading>Neutral caption</VariantHeading>
      <ContestList
        spAnnotation={
          <SpCaptionNeutral>
            Applying straight party vote: Democrat
          </SpCaptionNeutral>
        }
      />
    </div>
  );
}

/* ── Baseline: No annotation ── */

function Baseline(): JSX.Element {
  return (
    <div>
      <VariantHeading>No annotation (baseline)</VariantHeading>
      <ContestList spAnnotation={null} />
    </div>
  );
}

/* ── Main prototype ──────────────────────────────────────────── */

export function ContestListPrototype(): JSX.Element {
  return (
    <Screen>
      <Main>
        <Content>
          <H1 style={{ marginBottom: 0 }}>
            Contest List — SP Contest Annotation
          </H1>
          <p style={{ margin: 0 }}>
            Only the straight party contest item is annotated. The SP contest
            has an overvote (warning icon). It controls 3 partisan contests
            (President, Senator, Governor). Variant E is the baseline with no
            annotation for comparison.
          </p>

          <Row>
            <VariantA />
            <Baseline />
          </Row>
        </Content>
      </Main>
    </Screen>
  );
}
