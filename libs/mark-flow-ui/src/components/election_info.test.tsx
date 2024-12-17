import { singlePrecinctSelectionFor } from '@votingworks/utils';

import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { BallotStyleId } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import { ElectionInfo } from './election_info';

const electionDefinition = readElectionGeneralDefinition();
const { election } = electionDefinition;
const precinct = election.precincts[0];

test('renders ElectionInfo', () => {
  const { container } = render(
    <ElectionInfo
      precinctSelection={singlePrecinctSelectionFor(precinct.id)}
      electionDefinition={electionDefinition}
    />
  );
  expect(container.getElementsByTagName('img')).toHaveLength(1); // Seal
  screen.getByRole('heading', { name: election.title });
  screen.getByText('November 3, 2020');
  screen.getByText(precinct.name);
  screen.getByText(election.county.name);
  screen.getByText(election.state);
});

test('renders with ballot style id', () => {
  render(
    <ElectionInfo
      electionDefinition={electionDefinition}
      precinctSelection={singlePrecinctSelectionFor('23')}
      ballotStyleId={'12' as BallotStyleId}
    />
  );
  screen.getByText(/Center Springfield/);
  screen.getByText(hasTextAcrossElements(/ballot style: 12/i));
});
