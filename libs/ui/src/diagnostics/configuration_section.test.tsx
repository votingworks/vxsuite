import {
  electionGeneralFixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import { formatElectionHashes } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';
import { ConfigurationSection } from './configuration_section';
import { expectTextWithIcon } from '../../test/expect_text_with_icon';

test('no election', async () => {
  render(<ConfigurationSection />);

  screen.getByRole('heading', { name: 'Configuration' });
  await expectTextWithIcon(
    'No election currently loaded on device.',
    'circle-info'
  );
});

test('election, no precinct expected', () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
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
  screen.getByText(
    `Ballot Styles: 1-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 1-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 2-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 2-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 3-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 3-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 4-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 4-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)]`
  );
});

test('single language election, no precinct expected', () => {
  const { electionDefinition } = electionGeneralFixtures;

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
  screen.getByText(`Ballot Styles: 12, 5`);
});

test('election, precinct expected but not selected', async () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
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
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
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
  screen.getByText(
    `Ballot Styles: 1-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 1-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 2-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 2-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 3-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 3-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 4-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 4-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)]`
  );
});

test('election, single precinct selected', () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
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
  screen.getByText(
    `Ballot Styles: 1-Ma [Simplified Chinese, Traditional Chinese, English, Spanish (US)], 1-F [Simplified Chinese, Traditional Chinese, English, Spanish (US)]`
  );
});

test('election, mark threshold provided', () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
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
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
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
