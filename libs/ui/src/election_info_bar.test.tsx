import { afterEach, describe, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName as Feature,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { formatElectionHashes } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { render, screen, within } from '../test/react_testing_library';
import { ElectionInfoBar, VerticalElectionInfoBar } from './election_info_bar';
import { makeTheme } from './themes/make_theme';

const featureFlagMock = getFeatureFlagMock();
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (f: Feature) => featureFlagMock.isEnabled(f),
}));

const electionGeneralDefinition = readElectionGeneralDefinition();
const mockElectionPackageHash = '1111111111111111111111111';

const { election } = electionGeneralDefinition;
const pollingPlaces = assertDefined(election.pollingPlaces);

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

describe('ElectionInfoBar', () => {
  test('Renders with appropriate information', () => {
    render(
      <ElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0000"
        codeVersion="DEV"
        mode="admin"
      />
    );
    screen.getByText('General Election');
    screen.getByText('November 3, 2020');
    screen.getByText('Franklin County');
    screen.getByText('State of Hamilton');

    const versionLabel = screen.getByText('Version');
    expect(versionLabel.parentElement?.lastChild).toHaveTextContent('DEV');

    const machineIdLabel = screen.getByText('Machine ID');
    expect(machineIdLabel.parentElement?.lastChild).toHaveTextContent('0000');

    const electionIdLabel = screen.getByText('Election ID');
    expect(electionIdLabel.parentElement?.lastChild).toHaveTextContent(
      formatElectionHashes(
        electionGeneralDefinition.ballotHash,
        mockElectionPackageHash
      )
    );
  });

  test('Renders without election information', () => {
    render(<ElectionInfoBar machineId="0000" codeVersion="DEV" mode="admin" />);
    const versionLabel = screen.getByText('Version');
    expect(versionLabel.parentElement?.lastChild).toHaveTextContent('DEV');

    const machineIdLabel = screen.getByText('Machine ID');
    expect(machineIdLabel.parentElement?.lastChild).toHaveTextContent('0000');
  });

  test('Renders with all precincts when specified', () => {
    setPollingPlacesEnabled(false);
    render(
      <ElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0000"
        codeVersion="DEV"
        mode="admin"
        precinctSelection={ALL_PRECINCTS_SELECTION}
      />
    );
    screen.getByText('All Precincts');
  });

  test('Renders with specific precinct', () => {
    setPollingPlacesEnabled(false);
    render(
      <ElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0002"
        codeVersion="DEV"
        mode="admin"
        precinctSelection={singlePrecinctSelectionFor('23')}
      />
    );
    screen.getByText('Center Springfield');
  });

  test('Renders with polling place selection', () => {
    setPollingPlacesEnabled(true);
    const place = pollingPlaces[0];

    render(
      <ElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0002"
        codeVersion="DEV"
        mode="admin"
        pollingPlaceId={place.id}
      />
    );

    screen.getByText(place.name);
  });

  test('Renders without admin info in default voter mode', () => {
    render(
      <ElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0002"
        codeVersion="DEV"
        precinctSelection={singlePrecinctSelectionFor('23')}
      />
    );
    expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Machined ID/)).not.toBeInTheDocument();
  });

  test('Renders seal', () => {
    render(
      <ElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
      />
    );
    screen.getByTestId('seal');
  });
});

describe('VerticalElectionInfoBar', () => {
  test('Renders with appropriate information', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0000"
        codeVersion="DEV"
        mode="admin"
      />
    );
    screen.getByText('General Election');
    screen.getByText('November 3, 2020');
    screen.getByText('Franklin County');
    screen.getByText('State of Hamilton');

    screen.getByText(hasTextAcrossElements('Version: DEV'));
    screen.getByText(hasTextAcrossElements('Machine ID: 0000'));
    screen.getByText(/Election ID/);
    within(screen.getByText(/Election ID/).parentElement!).getByText(
      formatElectionHashes(
        electionGeneralDefinition.ballotHash,
        mockElectionPackageHash
      )
    );
  });

  test('Renders without election information', () => {
    render(
      <VerticalElectionInfoBar
        machineId="0000"
        codeVersion="DEV"
        mode="admin"
      />
    );
    screen.getByText(hasTextAcrossElements('Version: DEV'));
    screen.getByText(hasTextAcrossElements('Machine ID: 0000'));
  });

  test('Renders with all precincts when specified', () => {
    setPollingPlacesEnabled(false);
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0000"
        codeVersion="DEV"
        mode="admin"
        precinctSelection={ALL_PRECINCTS_SELECTION}
      />
    );
    screen.getByText('All Precincts');
  });

  test('Renders with specific precinct', () => {
    setPollingPlacesEnabled(false);
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0002"
        codeVersion="DEV"
        mode="admin"
        precinctSelection={singlePrecinctSelectionFor('23')}
      />
    );
    screen.getByText('Center Springfield');
  });

  test('Renders with polling place selection', () => {
    setPollingPlacesEnabled(true);
    const place = pollingPlaces[0];

    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0002"
        codeVersion="DEV"
        mode="admin"
        pollingPlaceId={place.id}
      />
    );

    screen.getByText(place.name);
  });

  test('Renders without admin info in default voter mode', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        machineId="0002"
        codeVersion="DEV"
        precinctSelection={singlePrecinctSelectionFor('23')}
      />
    );
    expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Machined ID/)).not.toBeInTheDocument();
  });

  test('Renders seal', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
      />
    );
    screen.getByTestId('seal');
  });

  test('Renders inverse', () => {
    const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
    const { container } = render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
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

function setPollingPlacesEnabled(enabled: boolean) {
  const { ENABLE_POLLING_PLACES } = Feature;
  if (enabled) {
    featureFlagMock.enableFeatureFlag(ENABLE_POLLING_PLACES);
  } else {
    featureFlagMock.disableFeatureFlag(ENABLE_POLLING_PLACES);
  }
}
