import { singlePrecinctSelectionFor } from '@votingworks/utils';

import { electionGeneralDefinition as electionDefinition } from '@votingworks/fixtures';
import { render, screen } from '../../test/react_testing_library';
import { ElectionInfo } from './election_info';

test('renders ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
    />
  );
  expect(container).toMatchSnapshot();
});

test('renders ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor('23')}
      electionDefinition={electionDefinition}
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
    />
  );
  screen.getByText(/Center Springfield/);
  screen.getByText(/ballot style: 12/i);
});
