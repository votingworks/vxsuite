import {
  Candidate,
  Election,
  LanguageCode,
  Parties,
  Party,
  PartyId,
  Precinct,
} from '@votingworks/types';
import { electionGeneral } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import {
  renderCandidatePartyList,
  renderPrecinctSelectionName,
  renderPrimaryElectionTitlePrefix,
} from './utils';
import { newTestContext } from '../../test/ui_strings/test_utils';
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

test('renderCandidatePartyList - single-party association', async () => {
  const { mockBackendApi, render } = newTestContext();
  mockBackendApi.getAvailableLanguages.mockResolvedValue([
    LanguageCode.SPANISH,
  ]);
  mockBackendApi.getUiStrings.mockResolvedValue({
    partyName: {
      party1: 'Libertad',
      party2: 'Federalista',
    },
  });

  render(
    <H1>
      Parties:{' '}
      {renderCandidatePartyList(
        {
          ...CANDIDATE,
          partyIds: [ELECTION_PARTIES[1].id],
        },
        ELECTION_PARTIES
      )}
    </H1>
  );

  await screen.findByRole('heading', { name: 'Parties: Federalista' });
});

test('renderCandidatePartyList - multi-party association', async () => {
  const { mockBackendApi, render } = newTestContext();
  mockBackendApi.getAvailableLanguages.mockResolvedValue([
    LanguageCode.SPANISH,
  ]);
  mockBackendApi.getUiStrings.mockResolvedValue({
    partyName: {
      party1: 'Libertad',
      party2: 'Federalista',
    },
  });

  render(
    <H1>
      Parties:{' '}
      {renderCandidatePartyList(
        {
          ...CANDIDATE,
          partyIds: [ELECTION_PARTIES[1].id, ELECTION_PARTIES[0].id],
        },
        ELECTION_PARTIES
      )}
    </H1>
  );

  await screen.findByRole('heading', {
    // react-testing-library seems to be interpreting a gap between the first
    // party and the comma, even though they're rendered adjacent in the
    // browser, so using a slightly more lenient regex here.
    name: /Parties: Federalista\s?, Libertad/,
  });
});

test('renderPrecinctSelectionName - all-precinct selection', async () => {
  const { mockBackendApi, render } = newTestContext();
  mockBackendApi.getAvailableLanguages.mockResolvedValue([]);
  mockBackendApi.getUiStrings.mockResolvedValue(null);

  render(
    <H1>
      Precincts: {renderPrecinctSelectionName([], { kind: 'AllPrecincts' })}
    </H1>
  );

  await screen.findByRole('heading', { name: 'Precincts: All Precincts' });
});

test('renderPrecinctSelectionName - single-precinct selection', async () => {
  const selectedPrecinct: Precinct = {
    id: 'precinctIdOldTown',
    name: 'Old Town',
  };
  const precincts: readonly Precinct[] = [
    { id: 'precinctIdNewTown', name: 'New Town' },
    selectedPrecinct,
  ];

  const { mockBackendApi, render } = newTestContext();
  mockBackendApi.getAvailableLanguages.mockResolvedValue([
    LanguageCode.SPANISH,
  ]);
  mockBackendApi.getUiStrings.mockResolvedValue({
    precinctName: {
      precinctIdOldTown: 'Ciutat Vella',
    },
  });

  render(
    <H1>
      Precincts:{' '}
      {renderPrecinctSelectionName(precincts, {
        kind: 'SinglePrecinct',
        precinctId: 'precinctIdOldTown',
      })}
    </H1>
  );

  await screen.findByRole('heading', { name: 'Precincts: Ciutat Vella' });
});

test('renderPrecinctSelectionName - no selection', async () => {
  const precincts: readonly Precinct[] = [
    { id: 'precinctA', name: 'New Town' },
  ];

  const { mockBackendApi, render } = newTestContext();
  mockBackendApi.getAvailableLanguages.mockResolvedValue([
    LanguageCode.SPANISH,
  ]);
  mockBackendApi.getUiStrings.mockResolvedValue({
    precinctName: {
      precinctB: 'Ciutat Vella',
    },
  });

  render(
    <H1>Precincts: {renderPrecinctSelectionName(precincts, undefined)}</H1>
  );

  await screen.findByRole('heading', { name: 'Precincts:' });
});

test('renderPrimaryElectionTitlePrefix - party-specific ballot', async () => {
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
        id: 'imp-ballot',
        districts: [],
        precincts: [],
        partyId: myParty.id,
      },
    ],
    parties: [...electionGeneral.parties, myParty],
  };

  const { mockBackendApi, render } = newTestContext();
  mockBackendApi.getAvailableLanguages.mockResolvedValue([
    LanguageCode.SPANISH,
  ]);
  mockBackendApi.getUiStrings.mockResolvedValue({
    partyName: {
      itsMyParty: 'Lloro Si Quiero',
    },
  });

  render(
    <H1>Prefix: {renderPrimaryElectionTitlePrefix('imp-ballot', election)}</H1>
  );

  await screen.findByRole('heading', { name: 'Prefix: Lloro Si Quiero' });
});

test('renderPrecinctSelectionName - non-party-specific ballot', async () => {
  const election = electionGeneral;
  const ballotStyle = assertDefined(election.ballotStyles[0]);

  const { mockBackendApi, render } = newTestContext();
  mockBackendApi.getAvailableLanguages.mockResolvedValue([]);
  mockBackendApi.getUiStrings.mockResolvedValue({});

  render(
    <H1>
      Prefix: {renderPrimaryElectionTitlePrefix(ballotStyle.id, election)}
    </H1>
  );

  await screen.findByRole('heading', { name: 'Prefix:' });
});
