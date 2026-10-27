import { describe, expect, test } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { formatElectionHashes } from '@votingworks/types';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { assertDefined } from '@votingworks/basics';
import { render, screen, within } from '../test/react_testing_library.js';
import {
  ElectionInfoBar,
  VerticalElectionInfoBar,
} from './election_info_bar.js';
import { makeTheme } from './themes/make_theme.js';

const electionGeneralDefinition = readElectionGeneralDefinition();
const mockElectionPackageHash = '1111111111111111111111111';

const { election } = electionGeneralDefinition;
const pollingPlaces = assertDefined(election.pollingPlaces);

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

  test('Renders lifetime sheet count outside voter mode', () => {
    render(<ElectionInfoBar mode="pollworker" lifetimeSheetsCounted={1234} />);
    const label = screen.getByText('Lifetime Scans');
    expect(label.parentElement?.lastChild).toHaveTextContent('1,234');
  });

  test('Renders a zero lifetime sheet count', () => {
    render(<ElectionInfoBar mode="admin" lifetimeSheetsCounted={0} />);
    const label = screen.getByText('Lifetime Scans');
    expect(label.parentElement?.lastChild).toHaveTextContent('0');
  });

  test('Omits lifetime sheet count when not provided', () => {
    render(<ElectionInfoBar mode="admin" />);
    expect(screen.queryByText('Lifetime Scans')).not.toBeInTheDocument();
  });

  test('Omits lifetime sheet count in voter mode', () => {
    render(<ElectionInfoBar mode="voter" lifetimeSheetsCounted={1234} />);
    expect(screen.queryByText('Lifetime Scans')).not.toBeInTheDocument();
  });

  test('Renders with polling place selection', () => {
    const place = pollingPlaces[0]!;

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

  test('Renders lifetime sheet count outside voter mode', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        mode="admin"
        lifetimeSheetsCounted={1234}
      />
    );
    screen.getByText(hasTextAcrossElements('Lifetime Scans: 1,234'));
  });

  test('Renders lifetime sheet count without election information', () => {
    render(<VerticalElectionInfoBar mode="admin" lifetimeSheetsCounted={0} />);
    screen.getByText(hasTextAcrossElements('Lifetime Scans: 0'));
  });

  test('Omits lifetime sheet count in voter mode', () => {
    render(
      <VerticalElectionInfoBar
        electionDefinition={electionGeneralDefinition}
        electionPackageHash={mockElectionPackageHash}
        lifetimeSheetsCounted={1234}
      />
    );
    expect(screen.queryByText(/Lifetime Scans/)).not.toBeInTheDocument();
  });

  test('Renders with polling place selection', () => {
    const place = pollingPlaces[0]!;

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
      backgroundColor: theme.colors.inverseBackground,
      color: theme.colors.onInverse,
    });
  });
});
