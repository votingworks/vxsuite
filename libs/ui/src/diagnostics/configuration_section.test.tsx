import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import { getDisplayElectionHash } from '@votingworks/types';
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
  render(<ConfigurationSection electionDefinition={electionDefinition} />);

  screen.getByRole('heading', { name: 'Configuration' });
  screen.getByText(
    `Election: Example Primary Election, ${getDisplayElectionHash(
      electionDefinition
    )}`
  );
  expect(screen.queryByText('Precinct:')).not.toBeInTheDocument();
  screen.getByText(
    `Ballot Styles: m-c1-w1, f-c1-w1, m-c1-w2, f-c1-w2, m-c2-w1, f-c2-w1, m-c2-w2, f-c2-w2`
  );
});

test('election, precinct expected but not selected', async () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      expectPrecinctSelection
    />
  );

  screen.getByRole('heading', { name: 'Configuration' });
  screen.getByText(
    `Election: Example Primary Election, ${getDisplayElectionHash(
      electionDefinition
    )}`
  );
  await expectTextWithIcon('No precinct selected.', 'triangle-exclamation');
});

test('election, all precincts selected', () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      expectPrecinctSelection
      precinctSelection={{
        kind: 'AllPrecincts',
      }}
    />
  );

  screen.getByRole('heading', { name: 'Configuration' });
  screen.getByText(
    `Election: Example Primary Election, ${getDisplayElectionHash(
      electionDefinition
    )}`
  );
  screen.getByText(`Precinct: All Precincts`);
  screen.getByText(
    `Ballot Styles: m-c1-w1, f-c1-w1, m-c1-w2, f-c1-w2, m-c2-w1, f-c2-w1, m-c2-w2, f-c2-w2`
  );
});

test('election, single precinct selected', () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      expectPrecinctSelection
      precinctSelection={{
        kind: 'SinglePrecinct',
        precinctId: 'precinct-c1-w1-1',
      }}
    />
  );

  screen.getByText(`Precinct: Precinct 1`);
  screen.getByText(`Ballot Styles: m-c1-w1, f-c1-w1`);
});
