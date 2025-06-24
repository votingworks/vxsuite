import { test, describe, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import {
  electionFamousNames2021Fixtures,
  electionSimpleSinglePrecinctFixtures,
} from '@votingworks/fixtures';
import { ElectionInfoBar, VerticalElectionInfoBar } from './election_info_bar';
import { renderInAppContext } from '../test/render_in_app_context';

const electionDef = electionFamousNames2021Fixtures.readElectionDefinition();
const { election, ballotHash } = electionDef;
const singlePrecinctElectionDef =
  electionSimpleSinglePrecinctFixtures.readElectionDefinition();
const singlePrecinctElection = singlePrecinctElectionDef.election;
const packageHash = 'test-package-hash';
const codeVersion = '1.2.3';
const machineId = 'MACHINE-123';

let unmount: () => void;

afterEach(() => {
  unmount();
});

describe('ElectionInfoBar', () => {
  test('renders minimal info if no election', () => {
    const renderResult = renderInAppContext(
      <ElectionInfoBar codeVersion={codeVersion} machineId={machineId} />
    );
    unmount = renderResult.unmount;
    screen.getByTestId('electionInfoBar');
    screen.getByText('Version');
    screen.getByText('Machine ID');
  });

  test('renders full election info', () => {
    const configuredPrecinctId = election.precincts[0].id;
    const renderResult = renderInAppContext(
      <ElectionInfoBar
        election={election}
        electionBallotHash={ballotHash}
        pollbookPackageHash={packageHash}
        codeVersion={codeVersion}
        machineId={machineId}
        configuredPrecinctId={configuredPrecinctId}
      />
    );
    unmount = renderResult.unmount;
    screen.getByText(election.title);
    screen.getByText(`${election.county.name}, ${election.state}`);
    screen.getByText('Version');
    screen.getByText('Machine ID');
    screen.getByText('Election ID');
    // Precinct name should be present
    screen.getByText(election.precincts[0].name);
  });

  test('does not show precinct if only one precinct', () => {
    const renderResult = renderInAppContext(
      <ElectionInfoBar
        election={singlePrecinctElection}
        electionBallotHash={singlePrecinctElectionDef.ballotHash}
        pollbookPackageHash={packageHash}
        codeVersion={codeVersion}
        machineId={machineId}
        configuredPrecinctId={singlePrecinctElection.precincts[0].id}
      />
    );
    unmount = renderResult.unmount;
    // Should not show the precinct label
    expect(screen.queryByText('Precinct')).toBeNull();
  });
});

describe('VerticalElectionInfoBar', () => {
  test('renders minimal info if no election', () => {
    const renderResult = renderInAppContext(
      <VerticalElectionInfoBar
        codeVersion={codeVersion}
        machineId={machineId}
      />
    );
    unmount = renderResult.unmount;
    screen.getByText('Version:');
    screen.getByText('Machine ID:');
  });

  test('renders full election info', () => {
    const configuredPrecinctId = election.precincts[0].id;
    const renderResult = renderInAppContext(
      <VerticalElectionInfoBar
        election={election}
        electionBallotHash={ballotHash}
        pollbookPackageHash={packageHash}
        codeVersion={codeVersion}
        machineId={machineId}
        configuredPrecinctId={configuredPrecinctId}
      />
    );
    unmount = renderResult.unmount;
    screen.getByText(election.title);
    screen.getByText(`${election.county.name}, ${election.state}`);
    screen.getByText('Version:');
    screen.getByText('Machine ID:');
    screen.getByText('Election ID:');
    // Precinct name should be present
    screen.getByText('Precinct:');
    screen.getByText(election.precincts[0].name);
  });

  test('does not show precinct if only one precinct', () => {
    const renderResult = renderInAppContext(
      <VerticalElectionInfoBar
        election={singlePrecinctElection}
        electionBallotHash={singlePrecinctElectionDef.ballotHash}
        pollbookPackageHash={packageHash}
        codeVersion={codeVersion}
        machineId={machineId}
        configuredPrecinctId={singlePrecinctElection.precincts[0].id}
      />
    );
    unmount = renderResult.unmount;
    // Should not show the precinct label
    expect(screen.queryByText('Precinct:')).toBeNull();
  });
});
