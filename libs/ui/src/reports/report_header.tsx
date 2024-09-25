import { format } from '@votingworks/utils';
import styled from 'styled-components';
import { Election } from '@votingworks/types';
import React from 'react';
import { Font } from '../typography';
import { Icons } from '../icons';

export const ReportHeader = styled.div`
  p {
    margin-top: 0;
    margin-bottom: 0.25em;
  }
`;

export const ReportTitle = styled.h1`
  margin-top: 0;
  margin-bottom: 0.5em;
`;

export function ReportElectionInfo({
  election,
  partyLabel,
}: {
  election: Election;
  partyLabel?: string;
}): JSX.Element {
  const electionDate = format.localeDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  return (
    <p>
      <Font weight="bold">
        {partyLabel && <React.Fragment>{partyLabel}, </React.Fragment>}
        {election.title}, {electionDate}, {election.county.name},{' '}
        {election.state}
      </Font>
    </p>
  );
}

export const ReportMetadata = styled.p`
  display: flex;
  gap: 1em;

  > * {
    white-space: nowrap;
  }
`;

export function LabeledValue({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): JSX.Element {
  return (
    <span>
      <Font weight="bold">{label}:</Font> {value}
    </span>
  );
}

const TestModeBannerContainer = styled.div`
  background-color: #e8e8e8;
  padding: 1em;
  margin-bottom: 1em;
  border: 1px solid rgb(194, 200, 203);

  h2 {
    margin-top: 0;
    margin-bottom: 0.5em;
  }
`;

export function TestModeBanner(): JSX.Element {
  return (
    <TestModeBannerContainer>
      <h2>
        <Icons.Warning /> Test Report
      </h2>
      This report was generated using test ballots and does not contain actual
      election results.
    </TestModeBannerContainer>
  );
}
