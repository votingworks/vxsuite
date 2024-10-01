import { format } from '@votingworks/utils';
import styled from 'styled-components';
import { Election } from '@votingworks/types';
import React from 'react';
import { Font } from '../typography';
import { Icons } from '../icons';
import { Box } from './layout';

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

export const ReportSubtitle = styled.h2`
  margin-top: -0.25em;
  margin-bottom: 0.5em;
`;

export function ReportElectionInfo({
  election,
}: {
  election: Election;
}): JSX.Element {
  const electionDate = format.localeDate(
    election.date.toMidnightDatetimeWithSystemTimezone()
  );
  return (
    <p>
      <Font weight="bold">
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

const TestModeBannerContainer = styled(Box)`
  padding: 1em;
  margin-bottom: 1em;

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
