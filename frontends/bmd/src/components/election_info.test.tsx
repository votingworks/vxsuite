import React from 'react';
import { render } from '@testing-library/react';
import { getSinglePrecinctSelection } from '@votingworks/types';

import { ElectionInfo } from './election_info';
import { electionSampleWithSealDefinition as electionDefinition } from '../data';

it('renders horizontal ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={getSinglePrecinctSelection('23')}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
  expect(container).toMatchSnapshot();
});

it('renders horizontal ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={getSinglePrecinctSelection('23')}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
  expect(container).toMatchSnapshot();
});

it('renders vertical ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={getSinglePrecinctSelection('23')}
      electionDefinition={electionDefinition}
    />
  );
  expect(container).toMatchSnapshot();
});

it('renders vertical ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={getSinglePrecinctSelection('23')}
      electionDefinition={electionDefinition}
    />
  );
  expect(container).toMatchSnapshot();
});
