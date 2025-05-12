import styled from 'styled-components';
import {
  AnyContest,
  ElectionDefinition,
  getContests,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import React from 'react';
import { Font, H2, H3 } from '../typography';
import { SuccessIcon } from './icons';

export interface BallotStyleReadinessReportProps {
  electionDefinition: ElectionDefinition;
}

const BallotStyleInfoList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  line-height: 1;
  padding-top: 0.5rem;
`;

const BallotStyleInfo = styled.div`
  max-width: 100%;
  page-break-inside: avoid;
`;

const BallotStyleInfoContent = styled.div`
  align-items: baseline;
  display: grid;
  grid-gap: 0.5rem;
  grid-template-columns: max-content minmax(min-content, max-content);
  max-width: 100%;
`;

const BallotStyleDetailLabel = styled(Font)`
  align-self: right;
`;

interface BallotStyleDetailValuesProps {
  numColumns: number;
}

const BallotStyleDetailValues = styled.div<BallotStyleDetailValuesProps>`
  display: grid;
  flex-direction: column;
  grid-gap: 0.5rem 1rem;
  grid-template-columns: repeat(
    ${(p) => p.numColumns},
    minmax(min-content, max-content)
  );
`;

interface BallotStyleDetailProps {
  label: string;
  numColumns?: number;
  values: string | string[];
}

function BallotStyleDetail(props: BallotStyleDetailProps) {
  const { label, numColumns, values } = props;

  return (
    <React.Fragment>
      <BallotStyleDetailLabel weight="bold">{label}:</BallotStyleDetailLabel>
      <BallotStyleDetailValues numColumns={numColumns || 1}>
        {Array.isArray(values)
          ? // eslint-disable-next-line react/no-array-index-key
            values.map((value, i) => <span key={`${i}-${value}`}>{value}</span>)
          : values}
      </BallotStyleDetailValues>
    </React.Fragment>
  );
}

function getContestLabel(contest: AnyContest) {
  const prefix =
    contest.type === 'candidate' ? `[Vote for ${contest.seats}] ` : '';
  return `${prefix}${contest.title}`;
}

function sortCompareFn(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function BallotStyleReadinessReport(
  props: BallotStyleReadinessReportProps
): JSX.Element {
  const { electionDefinition } = props;
  const { election } = electionDefinition;

  const partyNames = Object.fromEntries(
    election.parties.map((p) => [p.id, p.fullName])
  );

  const districtNames = Object.fromEntries(
    election.districts.map((d) => [d.id, d.name])
  );

  const precinctNames = Object.fromEntries(
    election.precincts.map((p) => [p.id, p.name])
  );

  return (
    <section>
      <H2>Ballot Styles</H2>
      <BallotStyleInfoList>
        {election.ballotStyles.map((b) => (
          <BallotStyleInfo key={b.id}>
            <H3>
              <SuccessIcon /> {b.id}
            </H3>
            <BallotStyleInfoContent>
              {b.partyId && (
                <BallotStyleDetail
                  label="Party"
                  values={partyNames[b.partyId]}
                />
              )}
              <BallotStyleDetail
                label="Language"
                values={format.languageDisplayName({
                  languageCode: b.languages?.[0] || 'en',
                  displayLanguageCode: 'en',
                  style: 'long',
                })}
              />
              <BallotStyleDetail
                label="Districts"
                numColumns={3}
                values={b.districts
                  .map((id) => districtNames[id])
                  .sort(sortCompareFn)}
              />
              <BallotStyleDetail
                label="Precincts"
                numColumns={3}
                values={b.precincts
                  .map((id) => precinctNames[id])
                  .sort(sortCompareFn)}
              />
              <BallotStyleDetail
                label="Contests"
                numColumns={2}
                values={getContests({ ballotStyle: b, election }).map(
                  getContestLabel
                )}
              />
            </BallotStyleInfoContent>
          </BallotStyleInfo>
        ))}
      </BallotStyleInfoList>
    </section>
  );
}
