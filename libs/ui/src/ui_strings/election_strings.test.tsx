import { Candidate, LanguageCode, Parties, PartyId } from '@votingworks/types';
import { renderCandidatePartyList } from './election_strings';
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
