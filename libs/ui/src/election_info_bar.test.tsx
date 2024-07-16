import { electionGeneralDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { getDisplayBallotHash } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { render, screen, within } from '../test/react_testing_library';
import { ElectionInfoBar, VerticalElectionInfoBar } from './election_info_bar';
import { makeTheme } from './themes/make_theme';

jest.mock('@votingworks/types', () => {
  return {
    ...jest.requireActual('@votingworks/types'),
    // mock ballot hash so snapshots don't change with every change to the election definition
    getDisplayBallotHash: () => '0000000000',
  };
});

describe('ElectionInfoBar', () => {
  test('Renders with appropriate information', () => {
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
      getDisplayBallotHash(electionGeneralDefinition)
    );
  });

  test('Renders with all precincts when specified', () => {
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

  test('Renders with specific precinct', () => {
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

  test('Renders without admin info in default voter mode', () => {
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

  test('Renders seal', () => {
    render(<ElectionInfoBar electionDefinition={electionGeneralDefinition} />);
    screen.getByTestId('seal');
  });

  test('Renders inverse', () => {
    const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
    const { container } = render(
      <ElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        inverse
      />,
      { vxTheme: theme }
    );
    const infoBar = container.firstChild;
    expect(infoBar).toHaveStyle({
      background: theme.colors.inverseBackground,
      color: theme.colors.onInverse,
    });
  });
});

describe('VerticalElectionInfoBar', () => {
  test('Renders with appropriate information', () => {
    render(
      <VerticalElectionInfoBar
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

    screen.getByText(hasTextAcrossElements('Software Version: DEV'));
    screen.getByText(hasTextAcrossElements('Machine ID: 0000'));
    screen.getByText(/Election ID/);
    within(screen.getByText(/Election ID/).parentElement!).getByText(
      getDisplayBallotHash(electionGeneralDefinition)
    );
  });

  test('Renders with all precincts when specified', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        machineId="0000"
        codeVersion="DEV"
        mode="admin"
        precinctSelection={ALL_PRECINCTS_SELECTION}
      />
    );
    screen.getByText('All Precincts');
  });

  test('Renders with specific precinct', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        machineId="0002"
        codeVersion="DEV"
        mode="admin"
        precinctSelection={singlePrecinctSelectionFor('23')}
      />
    );
    screen.getByText('Center Springfield');
  });

  test('Renders without admin info in default voter mode', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        machineId="0002"
        codeVersion="DEV"
        precinctSelection={singlePrecinctSelectionFor('23')}
      />
    );
    expect(screen.queryByText(/Software Version/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Machined ID/)).not.toBeInTheDocument();
  });

  test('Renders seal', () => {
    render(
      <VerticalElectionInfoBar electionDefinition={electionGeneralDefinition} />
    );
    screen.getByTestId('seal');
  });

  test('Renders inverse', () => {
    const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
    const { container } = render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        inverse
      />,
      { vxTheme: theme }
    );
    const infoBar = container.firstChild;
    expect(infoBar).toHaveStyle({
      background: theme.colors.inverseBackground,
      color: theme.colors.onInverse,
    });
  });
});
