import {
  BallotStyleGroupId,
  BallotStyleId,
  Candidate,
  Election,
  Parties,
  Party,
  PartyId,
  Precinct,
} from '@votingworks/types';
import { readElectionGeneral } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import {
  CandidatePartyList,
  PrecinctSelectionName,
  PrimaryElectionTitlePrefix,
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

const electionGeneral = readElectionGeneral();

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
  };
  const precincts: readonly Precinct[] = [
    { id: 'precinctIdNewTown', name: 'New Town' },
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
    { id: 'precinctA', name: 'New Town' },
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

test('PrimaryElectionTitlePrefix - party-specific ballot', async () => {
  const myParty: Party = {
    id: 'itsMyParty' as PartyId,
    fullName: "And I'll Cry If I Want To",
    name: 'Cry If I Want To',
    abbrev: 'IMP',
  };

  const election: Election = {
    ...electionGeneral,
    ballotStyles: [
      ...electionGeneral.ballotStyles,
      {
        id: 'imp-ballot' as BallotStyleId,
        groupId: 'imp-ballot' as BallotStyleGroupId,
        districts: [],
        precincts: [],
        partyId: myParty.id,
      },
    ],
    parties: [...electionGeneral.parties, myParty],
  };

  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue(['es-US']);
  mockApiClient.getUiStrings.mockResolvedValue({
    partyName: {
      itsMyParty: 'Lloro Si Quiero',
    },
  });

  render(
    <H1>
      Prefix:{' '}
      <PrimaryElectionTitlePrefix
        ballotStyleId={'imp-ballot' as BallotStyleId}
        election={election}
      />
    </H1>
  );

  await screen.findByRole('heading', { name: /Prefix: Lloro Si Quiero/ });
});

test('PrecinctSelectionName - non-party-specific ballot', async () => {
  const election = electionGeneral;
  const ballotStyle = assertDefined(election.ballotStyles[0]);

  const { mockApiClient, render } = newTestContext();
  mockApiClient.getAvailableLanguages.mockResolvedValue([]);
  mockApiClient.getUiStrings.mockResolvedValue({});

  render(
    <H1>
      Prefix:{' '}
      <PrimaryElectionTitlePrefix
        ballotStyleId={ballotStyle.id}
        election={election}
      />
    </H1>
  );

  await screen.findByRole('heading', { name: 'Prefix:' });
});
