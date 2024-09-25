import { format } from '@votingworks/utils';
import styled from 'styled-components';
import { Election } from '@votingworks/types';
import React from 'react';
import { Font } from '../typography';

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
