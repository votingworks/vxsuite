import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { getDisplayElectionHash } from '@votingworks/types';
import { render, screen, within } from '../test/react_testing_library';
import { ElectionInfoBar } from './election_info_bar';

jest.mock('@votingworks/types', () => {
  return {
    ...jest.requireActual('@votingworks/types'),
    // mock election hash so snapshots don't change with every change to the election definition
    getDisplayElectionHash: () => '0000000000',
  };
});

test('Renders ElectionInfoBar with appropriate information', () => {
  render(
    <ElectionInfoBar
      electionDefinition={electionGeneralDefinition}
      machineId="0000"
      codeVersion="DEV"
      mode="admin"
    />
  );
  screen.getByText('General Election');
  screen.getByText('November 3, 2020');
  screen.getByText('Franklin County');
  screen.getByText('State of Hamilton');

  const versionLabel = screen.getByText('Software Version');
  expect(versionLabel.parentElement?.lastChild).toHaveTextContent('DEV');

  const machineIdLabel = screen.getByText('Machine ID');
  expect(machineIdLabel.parentElement?.lastChild).toHaveTextContent('0000');

  const electionIdLabel = screen.getByText('Election ID');
  expect(electionIdLabel.parentElement?.lastChild).toHaveTextContent(
    getDisplayElectionHash(electionGeneralDefinition)
  );
});

test('Renders ElectionInfoBar with all precincts when specified', () => {
  render(
    <ElectionInfoBar
      electionDefinition={electionGeneralDefinition}
      machineId="0000"
      codeVersion="DEV"
      mode="admin"
      precinctSelection={ALL_PRECINCTS_SELECTION}
    />
  );
  screen.getByText('All Precincts');
});

test('Renders ElectionInfoBar with specific precinct', () => {
  render(
    <ElectionInfoBar
      electionDefinition={electionGeneralDefinition}
      machineId="0002"
      codeVersion="DEV"
      mode="admin"
      precinctSelection={singlePrecinctSelectionFor('23')}
    />
  );
  screen.getByText('Center Springfield');
});

test('Renders ElectionInfoBar without admin info in default voter mode', () => {
  render(
    <ElectionInfoBar
      electionDefinition={electionGeneralDefinition}
      machineId="0002"
      codeVersion="DEV"
      precinctSelection={singlePrecinctSelectionFor('23')}
    />
  );
  expect(screen.queryByText(/Software Version/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Machined ID/)).not.toBeInTheDocument();
});

test('Renders ElectionInfoBar seal', () => {
  render(<ElectionInfoBar electionDefinition={electionGeneralDefinition} />);
  expect(screen.getByTestId('seal').innerHTML.toString()).toMatch(
    /Seal of Montgomery County, Maryland/
  );
  screen.getByText('Election ID');
  within(screen.getByText('Election ID').parentElement!).getByText(
    getDisplayElectionHash(electionGeneralDefinition)
  );
});
