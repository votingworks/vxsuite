import { singlePrecinctSelectionFor } from '@votingworks/utils';

import { electionSampleDefinition as electionDefinition } from '@votingworks/fixtures';
import { render, screen } from '../../test/react_testing_library';
import { ElectionInfo } from './election_info';

test('renders ElectionInfo with hash when specified', () => {
  render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
    />
  );
});

test('renders ElectionInfo without hash by default', () => {
  render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
    />
  );
});

test('renders with ballot style id', () => {
  render(
    <ElectionInfo
      electionDefinition={electionDefinition}
      precinctSelection={singlePrecinctSelectionFor('23')}
      ballotStyleId="12"
    />
  );
  screen.getByText(/Center Springfield/);
  screen.getByText(/ballot style: 12/i);
});
