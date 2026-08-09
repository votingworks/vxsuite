import { describe, expect, test } from 'vitest';
import {
  electionGeneralFixtures,
  electionPrimaryPrecinctSplitsFixtures,
} from '@votingworks/fixtures';
import {
  BallotStyle,
  Election,
  formatElectionHashes,
  PollingPlace,
  pollingPlaceTypeName,
} from '@votingworks/types';
import { getGroupedBallotStyles } from '@votingworks/utils';
import { render, screen } from '../../test/react_testing_library.js';
import {
  AllBallotStylesSection,
  ConfigurationSection,
  MarkThresholdsSection,
  PollingPlaceSection,
} from './configuration_section.js';
import { expectTextWithIcon } from '../../test/expect_text_with_icon.js';

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
    >
      <AllBallotStylesSection election={electionDefinition.election} />
    </ConfigurationSection>
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
    >
      <AllBallotStylesSection election={electionDefinition.election} />
    </ConfigurationSection>
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

test('election, mark threshold provided', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  render(
    <ConfigurationSection
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
    >
      <MarkThresholdsSection
        markThresholds={{
          definite: 0.07,
          marginal: 0.05,
          writeInTextArea: 0.05,
        }}
      />
    </ConfigurationSection>
  );

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
    >
      <MarkThresholdsSection
        markThresholds={{
          definite: 0.12345678,
          marginal: 0.05,
          writeInTextArea: 0.87654321,
        }}
      />
    </ConfigurationSection>
  );

  screen.getByText(`Mark Threshold: 0.1234`);
  screen.getByText(`Write-in Threshold: 0.8765`);
});

describe('AllBallotStylesSection', () => {
  test('no configured election', () => {
    const { container } = render(<AllBallotStylesSection />);
    expect(container.textContent).toEqual('');
  });

  test('with election', () => {
    const election = electionPrimaryPrecinctSplitsFixtures.readElection();
    render(<AllBallotStylesSection election={election} />);

    for (const bs of election.ballotStyles) {
      screen.getByText(bs.groupId, { exact: false });
    }
  });
});

describe('PollingPlaceSection', () => {
  const baseElection = electionPrimaryPrecinctSplitsFixtures.readElection();
  const [precinct1, precinct2] = baseElection.precincts;

  const bs1: BallotStyle = {
    ...baseElection.ballotStyles[0],
    groupId: '1',
    id: '1_en',
    languages: ['en'],
    precincts: [precinct1.id],
  };
  const bs2: BallotStyle = {
    ...baseElection.ballotStyles[1],
    groupId: '2',
    id: '2_en',
    languages: ['en'],
    precincts: [precinct1.id, precinct2.id],
  };

  const singlePrecinctPlace: PollingPlace = {
    id: 'singlePrecinctPlace',
    name: 'Single-Precinct Polling Place',
    precincts: { [precinct2.id]: { type: 'whole' } },
    type: 'election_day',
  };

  const multiPrecinctPlace: PollingPlace = {
    id: 'multiPrecinctPlace',
    name: 'Multi-Precinct Polling Place',
    precincts: {
      [precinct1.id]: { type: 'whole' },
      [precinct2.id]: { type: 'whole' },
    },
    type: 'early_voting',
  };

  const election: Election = {
    ...baseElection,
    ballotStyles: [bs1, bs2],
    pollingPlaces: [singlePrecinctPlace, multiPrecinctPlace],
  };

  test('no election configured', () => {
    const { container } = render(<PollingPlaceSection />);
    expect(container.textContent).toEqual('');
  });

  test('no polling place selected', async () => {
    render(<PollingPlaceSection election={election} />);

    await expectTextWithIcon(
      'No polling place selected.',
      'triangle-exclamation'
    );
  });

  test('with single-precinct polling place', () => {
    const place = singlePrecinctPlace;
    render(
      <PollingPlaceSection election={election} pollingPlaceId={place.id} />
    );

    screen.getByText(`Polling Place: ${place.name}`);
    screen.getByText(`(${pollingPlaceTypeName(place.type)})`);
    screen.getByText(`Ballot Styles: ${bs2.id}`);
  });

  test('with multi-precinct polling place', () => {
    const place = multiPrecinctPlace;
    render(
      <PollingPlaceSection election={election} pollingPlaceId={place.id} />
    );

    screen.getByText(`Polling Place: ${place.name}`);
    screen.getByText(`(${pollingPlaceTypeName(place.type)})`);
    screen.getByText(`Ballot Styles: ${bs1.id}, ${bs2.id}`);
  });
});
