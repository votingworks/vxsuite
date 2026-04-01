import { test } from 'vitest';
import {
  Candidate,
  DistrictId,
  Election,
  ElectionStringKey,
  Parties,
  PartyId,
  PollingPlace,
  Precinct,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  CandidatePartyList,
  PollingPlaceName,
  PrecinctSelectionName,
} from './utils';
import { newTestContext } from '../../test/test_context';
import { H1 } from '..';
import { screen } from '../../test/react_testing_library';

const ELECTION_PARTIES: Readonly<Parties> = [
  {
    abbrev: 'Lb',
    fullName: 'Liberty Party',
    id: 'party1' as PartyId,
    name: 'Liberty',
  },
  {
    abbrev: 'Fe',
    fullName: 'Federalist Party',
    id: 'party2' as PartyId,
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

test('PrecinctSelectionName - all-precinct selection', async () => {
  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue([]);
  mockApiClient.getUiStrings.mockResolvedValue(null);

  render(
    <H1>
      Precincts:{' '}
      <PrecinctSelectionName
        electionPrecincts={[]}
        precinctSelection={ALL_PRECINCTS_SELECTION}
      />
    </H1>
  );

  await screen.findByRole('heading', { name: 'Precincts: All Precincts' });
});

test('PrecinctSelectionName - single-precinct selection', async () => {
  const selectedPrecinct: Precinct = {
    id: 'precinctIdOldTown',
    name: 'Old Town',
    districtIds: ['districtId' as DistrictId],
  };
  const precincts: readonly Precinct[] = [
    {
      id: 'precinctIdNewTown',
      name: 'New Town',
      districtIds: ['districtId' as DistrictId],
    },
    selectedPrecinct,
  ];

  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['es-US']);
  mockApiClient.getUiStrings.mockResolvedValue({
    precinctName: {
      precinctIdOldTown: 'Ciutat Vella',
    },
  });

  render(
    <H1>
      Precincts:{' '}
      <PrecinctSelectionName
        electionPrecincts={precincts}
        precinctSelection={singlePrecinctSelectionFor('precinctIdOldTown')}
      />
    </H1>
  );

  await screen.findByRole('heading', { name: 'Precincts: Ciutat Vella' });
});

test('PrecinctSelectionName - no selection', async () => {
  const precincts: readonly Precinct[] = [
    {
      id: 'precinctA',
      name: 'New Town',
      districtIds: ['districtId' as DistrictId],
    },
  ];

  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['es-US']);
  mockApiClient.getUiStrings.mockResolvedValue({
    precinctName: {
      precinctB: 'Ciutat Vella',
    },
  });

  render(
    <H1>
      Precincts: <PrecinctSelectionName electionPrecincts={precincts} />
    </H1>
  );

  await screen.findByRole('heading', { name: 'Precincts:' });
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
