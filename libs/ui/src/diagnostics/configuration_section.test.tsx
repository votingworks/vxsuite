import {
  electionGeneralFixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import { formatElectionHashes } from '@votingworks/types';
import { getGroupedBallotStyles } from '@votingworks/utils';
import { render, screen } from '../../test/react_testing_library';
import { ConfigurationSection } from './configuration_section';
import { expectTextWithIcon } from '../../test/expect_text_with_icon';

test('no election', async () => {
  render(<ConfigurationSection />);

  screen.getByRole('heading', { name: 'Configuration' });
  await expectTextWithIcon('No election loaded on device', 'circle-info');
});

test('election, no precinct expected', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
    />
  );

  screen.getByRole('heading', { name: 'Configuration' });
  screen.getByText(
    `Election: Example Primary Election, ${formatElectionHashes(
      electionDefinition.ballotHash,
      'test-election-package-hash'
    )}`
  );
  expect(screen.queryByText('Precinct:')).not.toBeInTheDocument();
  screen.getByText(`Ballot Styles:`);
  expect(
    screen.getAllByText(
      `Simplified Chinese, Traditional Chinese, English, Spanish (US)`
    )
  ).toHaveLength(8);
  for (const ballotStyle of getGroupedBallotStyles(
    electionDefinition.election.ballotStyles
  )) {
    screen.getByText(ballotStyle.id);
  }
});

test('single language election, no precinct expected', () => {
  const electionDefinition = electionGeneralFixtures.readElectionDefinition();

  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
    />
  );

  screen.getByRole('heading', { name: 'Configuration' });
  screen.getByText(
    `Election: General Election, ${formatElectionHashes(
      electionDefinition.ballotHash,
      'test-el'
    )}`
  );
  expect(screen.queryByText('Precinct:')).not.toBeInTheDocument();
  // Since there is only one language per ballot style we don't need to specify that information.
  screen.getByText('Ballot Styles: 12, 5');
});

test('election, precinct expected but not selected', async () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      expectPrecinctSelection
    />
  );

  screen.getByRole('heading', { name: 'Configuration' });
  screen.getByText(
    `Election: Example Primary Election, ${formatElectionHashes(
      electionDefinition.ballotHash,
      'test-election-package-hash'
    )}`
  );
  await expectTextWithIcon('No precinct selected.', 'triangle-exclamation');
});

test('election, all precincts selected', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      expectPrecinctSelection
      precinctSelection={{
        kind: 'AllPrecincts',
      }}
    />
  );

  screen.getByRole('heading', { name: 'Configuration' });
  screen.getByText(
    `Election: Example Primary Election, ${formatElectionHashes(
      electionDefinition.ballotHash,
      'test-election-package-hash'
    )}`
  );
  screen.getByText(`Precinct: All Precincts`);
  screen.getByText(`Ballot Styles:`);
  expect(
    screen.getAllByText(
      `Simplified Chinese, Traditional Chinese, English, Spanish (US)`
    )
  ).toHaveLength(8);
  for (const ballotStyle of getGroupedBallotStyles(
    electionDefinition.election.ballotStyles
  )) {
    screen.getByText(ballotStyle.id);
  }
});

test('election, single precinct selected', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      expectPrecinctSelection
      precinctSelection={{
        kind: 'SinglePrecinct',
        precinctId: 'precinct-c1-w1-1',
      }}
    />
  );

  screen.getByText(`Precinct: Precinct 1`);
  screen.getByText(`Ballot Styles:`);
  expect(
    screen.getAllByText(
      `Simplified Chinese, Traditional Chinese, English, Spanish (US)`
    )
  ).toHaveLength(2);
  screen.getByText('1-Ma');
  screen.getByText('1-F');
  expect(screen.queryByText('2-F')).not.toBeInTheDocument();
});

test('election, mark threshold provided', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      expectPrecinctSelection
      precinctSelection={{
        kind: 'SinglePrecinct',
        precinctId: 'precinct-c1-w1-1',
      }}
      markThresholds={{
        definite: 0.07,
        marginal: 0.05,
        writeInTextArea: 0.05,
      }}
    />
  );

  screen.getByText(`Precinct: Precinct 1`);
  screen.getByText(`Mark Threshold: 0.07`);
  screen.getByText(`Write-in Threshold: 0.05`);
});

test('election, mark threshold properly truncated', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      expectPrecinctSelection
      precinctSelection={{
        kind: 'SinglePrecinct',
        precinctId: 'precinct-c1-w1-1',
      }}
      markThresholds={{
        definite: 0.12345678,
        marginal: 0.05,
        writeInTextArea: 0.87654321,
      }}
    />
  );

  screen.getByText(`Precinct: Precinct 1`);
  screen.getByText(`Mark Threshold: 0.1234`);
  screen.getByText(`Write-in Threshold: 0.8765`);
});
