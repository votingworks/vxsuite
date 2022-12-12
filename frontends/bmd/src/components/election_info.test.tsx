import React from 'react';
import { render, screen } from '@testing-library/react';
import { singlePrecinctSelectionFor } from '@votingworks/utils';

import { ElectionInfo } from './election_info';
import {
  electionSampleWithSealDefinition as electionDefinition,
  electionSampleDefinition,
} from '../data';

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
      electionDefinition={electionSampleDefinition}
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

// test.only('renders vertical without precinct name', () => {
//   render(<ElectionInfo electionDefinition={electionSampleDefinition} />);
//   screen.debug();
//   screen.getByLabelText(
//     'November 3, 2020. State of Hamilton, Franklin County.'
//   );
// });
