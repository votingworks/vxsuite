import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  electionSampleDefinition,
  primaryElectionSampleDefinition,
} from '@votingworks/fixtures';
import { Seal } from './seal';

test('Seal with svg value', () => {
  render(<Seal seal={electionSampleDefinition.election.seal} />);
  expect(
    screen.queryByText('Seal of Montgomery County, Maryland.')
  ).toBeInTheDocument();
  // expect(screen.queryByAltText('state seal')).toBeInTheDocument();
});

test('Seal with url value', () => {
  render(<Seal sealUrl={primaryElectionSampleDefinition.election.sealUrl} />);
  expect(screen.queryByAltText('state seal')).toBeInTheDocument();
});
