import React from 'react';
import { render, screen } from '@testing-library/react';
import { singlePrecinctSelectionFor } from '@votingworks/shared';

import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { ElectionInfo } from './election_info';

test('renders horizontal ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
  expect(container).toMatchSnapshot();
});

test('renders horizontal ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
  expect(container).toMatchSnapshot();
});

test('renders with ballot style id', () => {
  render(
    <ElectionInfo
      electionDefinition={electionDefinition}
      precinctSelection={singlePrecinctSelectionFor('23')}
      ballotStyleId="12"
      horizontal
    />
  );
  screen.getByText(/Center Springfield/);
  screen.getByText('ballot style 12');
});

test('renders vertical ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
    />
  );
  expect(container).toMatchSnapshot();
});

test('renders vertical ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
    />
  );
  expect(container).toMatchSnapshot();
});
