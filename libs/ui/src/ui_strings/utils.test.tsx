import { test } from 'vitest';
import {
  Candidate,
  Election,
  ElectionStringKey,
  Parties,
  PollingPlace,
} from '@votingworks/types';
import { CandidatePartyList, PollingPlaceName } from './utils.js';
import { newTestContext } from '../../test/test_context.js';
import { H1 } from '../index.js';
import { screen } from '../../test/react_testing_library.js';

const ELECTION_PARTIES: Readonly<Parties> = [
  {
    abbrev: 'Lb',
    fullName: 'Liberty Party',
    id: 'party1',
    name: 'Liberty',
  },
  {
    abbrev: 'Fe',
    fullName: 'Federalist Party',
    id: 'party2',
    name: 'Federalist',
  },
];

const CANDIDATE: Readonly<Candidate> = {
  id: 'candidateX',
  name: 'Professor Xavier',
};

test('CandidatePartyList - single-party association', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['es-US']);
  mockApiClient.getUiStrings.mockResolvedValue({
    partyName: {
      party1: 'Libertad',
      party2: 'Federalista',
    },
  });

  render(
    <H1>
      Parties:{' '}
      <CandidatePartyList
        candidate={{
          ...CANDIDATE,
          partyIds: [ELECTION_PARTIES[1].id],
        }}
        electionParties={ELECTION_PARTIES}
      />
    </H1>
  );

  await screen.findByRole('heading', { name: 'Parties: Federalista' });
});

test('CandidatePartyList - multi-party association', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['es-US']);
  mockApiClient.getUiStrings.mockResolvedValue({
    partyName: {
      party1: 'Libertad',
      party2: 'Federalista',
    },
  });

  render(
    <H1>
      Parties:{' '}
      <CandidatePartyList
        candidate={{
          ...CANDIDATE,
          partyIds: [ELECTION_PARTIES[1].id, ELECTION_PARTIES[0].id],
        }}
        electionParties={ELECTION_PARTIES}
      />
    </H1>
  );

  await screen.findByRole('heading', {
    // react-testing-library seems to be interpreting a gap between the first
    // party and the comma, even though they're rendered adjacent in the
    // browser, so using a slightly more lenient regex here.
    name: /Parties: Federalista\s?, Libertad/,
  });
});

test('PollingPlaceName - with selection', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['es-US']);
  mockApiClient.getUiStrings.mockResolvedValue({
    [ElectionStringKey.POLLING_PLACE_NAME]: {
      p1: 'Centro de votación 1',
      p2: 'Centro de votación 2',
    },
  });

  const election = mockElection({
    pollingPlaces: [
      mockPollingPlace({ id: 'p1', name: 'Place 1' }),
      mockPollingPlace({ id: 'p2', name: 'Place 2' }),
    ],
  });

  render(
    <H1>
      Polling Place: <PollingPlaceName election={election} id="p2" />
    </H1>
  );

  await screen.findByRole('heading', {
    name: 'Polling Place: Centro de votación 2',
  });
});

test('PollingPlaceName - no selection', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['es-US']);
  mockApiClient.getUiStrings.mockResolvedValue({
    [ElectionStringKey.POLLING_PLACE_NAME]: { p1: 'Centro de votación 1' },
  });

  const election = mockElection({
    pollingPlaces: [mockPollingPlace({ id: 'p1', name: 'Place 1' })],
  });

  render(
    <H1>
      Polling Place: <PollingPlaceName election={election} id={undefined} />
    </H1>
  );

  await screen.findByRole('heading', { name: 'Polling Place:' });
});

function mockElection(partial: Partial<Election>): Election {
  return partial as Election;
}

function mockPollingPlace(partial: Partial<PollingPlace>): PollingPlace {
  return partial as PollingPlace;
}
