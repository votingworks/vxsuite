import { singlePrecinctSelectionFor } from '@votingworks/utils';

import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { render, screen } from '../../test/react_testing_library';
import { ElectionInfo } from './election_info';

test('renders horizontal ElectionInfo with hash when specified', () => {
  render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
});

test('renders horizontal ElectionInfo without hash by default', () => {
  render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
      horizontal
    />
  );
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
  render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
    />
  );
});

test('renders vertical ElectionInfo without hash by default', () => {
  render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
    />
  );
});
