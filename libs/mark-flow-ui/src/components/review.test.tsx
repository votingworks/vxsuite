import { describe, expect, test, vi } from 'vitest';
import {
  readElectionGeneral,
  readElectionWithMsEitherNeither,
} from '@votingworks/fixtures';
import {
  AnyContest,
  CandidateContest,
  Election,
  YesNoContest,
} from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen, within, render } from '../../test/react_testing_library';
import { mergeMsEitherNeitherContests } from '../utils/ms_either_neither_contests';
import { Review } from './review';
import { WriteInCandidateName } from './write_in_candidate_name';

vi.mock('./write_in_candidate_name');

const electionGeneral = readElectionGeneral();
const electionWithMsEitherNeither = readElectionWithMsEitherNeither();

test('renders', () => {
  const contests = mergeMsEitherNeitherContests(electionGeneral.contests);
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{}}
      returnToContest={vi.fn()}
      ballotStyle={electionGeneral.ballotStyles[0]}
    />
  );
  expect(
    screen.getAllByText('You may still vote in this contest.')
  ).toHaveLength(contests.length);
});

test('candidate contest with no votes', () => {
  const contest = electionGeneral.contests.find(
    (c): c is CandidateContest => c.type === 'candidate'
  );
  assert(contest);
  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{}}
      returnToContest={vi.fn()}
      ballotStyle={electionGeneral.ballotStyles[0]}
    />
  );
  expect(screen.getByText('You may still vote in this contest.')).toBeTruthy();
});

test('candidate contest interpretation result with no votes', () => {
  const contest = find(
    electionGeneral.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );

  render(
    <Review
      contests={[contest]}
      election={electionGeneral}
      selectionsAreEditable={false}
      precinctId={electionGeneral.precincts[0].id}
      returnToContest={vi.fn()}
      ballotStyle={electionGeneral.ballotStyles[0]}
      votes={{}}
    />
  );

  within(screen.getByTestId(`contest-wrapper-${contest.id}`)).getByText(
    /no selection/i
  );
});

test('candidate contest with votes but still undervoted', () => {
  const contest: CandidateContest = {
    ...find(
      electionGeneral.contests,
      (c): c is CandidateContest => c.type === 'candidate'
    ),
    seats: 3,
  };

  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{
        [contest.id]: [contest.candidates[0]],
      }}
      returnToContest={vi.fn()}
      ballotStyle={electionGeneral.ballotStyles[0]}
    />
  );

  screen.getByText(hasTextAcrossElements(/number of unused votes: 2/i));
});

test('candidate contest with multiple votes are ordered properly', () => {
  const contest: CandidateContest = {
    ...find(
      electionGeneral.contests,
      (c): c is CandidateContest => c.type === 'candidate'
    ),
    seats: 3,
  };

  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{
        [contest.id]: [
          contest.candidates[0],
          contest.candidates[3],
          contest.candidates[2],
        ],
      }}
      returnToContest={vi.fn()}
      ballotStyle={{
        ...electionGeneral.ballotStyles[0],
        orderedCandidatesByContest: {
          [contest.id]: [
            {
              id: contest.candidates[3].id,
              partyIds: contest.candidates[3].partyIds,
            },
            {
              id: contest.candidates[0].id,
              partyIds: contest.candidates[0].partyIds,
            },
            {
              id: contest.candidates[2].id,
              partyIds: contest.candidates[2].partyIds,
            },
            {
              id: contest.candidates[1].id,
              partyIds: contest.candidates[1].partyIds,
            },
            {
              id: contest.candidates[4].id,
              partyIds: contest.candidates[4].partyIds,
            },
            {
              id: contest.candidates[5].id,
              partyIds: contest.candidates[5].partyIds,
            },
          ],
        },
      }}
    />
  );

  // Find all rendered elements that contain any of the candidate names (escaped for regex),
  // which returns elements in DOM order so we can assert their order.
  function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const nameRegex = new RegExp(
    `^(${contest.candidates.map((c) => escapeRegex(c.name)).join('|')})$`
  );
  const candidateNames = screen.getAllByText(nameRegex);

  expect(candidateNames[0]).toHaveTextContent(contest.candidates[3].name);
  expect(candidateNames[1]).toHaveTextContent(contest.candidates[0].name);
  expect(candidateNames[2]).toHaveTextContent(contest.candidates[2].name);
});

test('candidate contest fully voted', () => {
  const contest = find(
    electionGeneral.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );
  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      precinctId={electionGeneral.precincts[0].id}
      votes={{
        [contest.id]: contest.candidates.slice(0, contest.seats),
      }}
      returnToContest={vi.fn()}
      ballotStyle={electionGeneral.ballotStyles[0]}
    />
  );
  expect(screen.queryByText(/You may still vote/)).not.toBeInTheDocument();
});

test('candidate contest - write-in', () => {
  vi.mocked(WriteInCandidateName).mockImplementation((p) => (
    <span data-testid="MockWriteInAudio">{p.name}</span>
  ));

  const contest = find(
    electionGeneral.contests,
    (c): c is CandidateContest => c.type === 'candidate' && c.seats === 1
  );
  const contests = [contest];
  render(
    <Review
      election={electionGeneral}
      contests={contests}
      ballotStyle={electionGeneral.ballotStyles[0]}
      precinctId={electionGeneral.precincts[0].id}
      votes={{
        [contest.id]: [
          {
            id: 'write-in-foo',
            name: 'HON. FOO',
            isWriteIn: true,
          },
        ],
      }}
      returnToContest={vi.fn()}
    />
  );

  expect(screen.getByTestId('MockWriteInAudio')).toHaveTextContent('HON. FOO');
});

test('candidate contest with term description', () => {
  let contest: CandidateContest | undefined;
  const election: Election = {
    ...electionGeneral,
    contests: electionGeneral.contests.map((c) => {
      if (c.type !== 'candidate' || !c.title.includes('President')) {
        return c;
      }

      contest = { ...c, termDescription: '4 Years' };
      return contest;
    }),
  };

  assert(contest);

  render(
    <Review
      election={election}
      contests={[contest]}
      precinctId={election.precincts[0].id}
      ballotStyle={election.ballotStyles[0]}
      votes={{}}
      returnToContest={vi.fn()}
    />
  );

  screen.getByText('4 Years');
});

describe('yesno contest', () => {
  const election = electionGeneral;
  const contest = find(
    election.contests,
    (c): c is YesNoContest => c.type === 'yesno'
  );

  test.each([[contest.yesOption.id], [contest.noOption.id], [undefined]])(
    'with vote: %s',
    (vote) => {
      const contests = [contest];
      const returnToContest = vi.fn();
      render(
        <Review
          election={election}
          contests={contests}
          ballotStyle={election.ballotStyles[0]}
          precinctId={election.precincts[0].id}
          votes={{
            [contest.id]: vote ? [vote] : [],
          }}
          returnToContest={returnToContest}
        />
      );
      const contestCard = screen
        .getByText(contest.title)
        .closest('div[role="button"]') as HTMLElement;
      within(contestCard).getByText(
        !vote
          ? 'You may still vote in this contest.'
          : vote === contest.yesOption.id
          ? 'Yes'
          : 'No'
      );

      userEvent.click(within(contestCard).getButton(/Change/));
      expect(returnToContest).toHaveBeenCalledWith(contest.id);
    }
  );

  test('empty vote interpretation result', () => {
    render(
      <Review
        election={electionGeneral}
        contests={[contest]}
        ballotStyle={electionGeneral.ballotStyles[0]}
        selectionsAreEditable={false}
        precinctId={electionGeneral.precincts[0].id}
        returnToContest={vi.fn()}
        votes={{}}
      />
    );

    within(screen.getByTestId(`contest-wrapper-${contest.id}`)).getByText(
      /no selection/i
    );
    // Make sure there are not elements with the text 'Yes' or 'No' to represent those votes.
    expect(
      within(screen.getByTestId(`contest-wrapper-${contest.id}`)).queryByText(
        'Yes'
      )
    ).toBeNull();
    expect(
      within(screen.getByTestId(`contest-wrapper-${contest.id}`)).queryByText(
        'No'
      )
    ).toBeNull();
  });
});

describe('ms-either-neither contest', () => {
  const election = electionWithMsEitherNeither;
  const eitherNeitherContest = find(
    election.contests,
    (c) => c.id === '750000015'
  );
  const pickOneContest = find(election.contests, (c) => c.id === '750000016');
  assert(eitherNeitherContest.type === 'yesno');
  assert(pickOneContest.type === 'yesno');

  const contests = mergeMsEitherNeitherContests(election.contests);
  const mergedContest = find(contests, (c) => c.type === 'ms-either-neither');

  test.each([
    [eitherNeitherContest.yesOption.id, pickOneContest.yesOption.id],
    [eitherNeitherContest.yesOption.id, pickOneContest.noOption.id],
    [eitherNeitherContest.noOption.id, pickOneContest.yesOption.id],
    [eitherNeitherContest.noOption.id, pickOneContest.noOption.id],
    [eitherNeitherContest.yesOption.id, undefined],
    [undefined, undefined],
  ])('with votes: %s/%s', (eitherNeitherVote, pickOneVote) => {
    render(
      <Review
        election={election}
        contests={contests}
        ballotStyle={election.ballotStyles[0]}
        precinctId={election.precincts[0].id}
        votes={{
          '750000015': eitherNeitherVote ? [eitherNeitherVote] : [],
          '750000016': pickOneVote ? [pickOneVote] : [],
        }}
        returnToContest={vi.fn()}
      />
    );

    const contestVoteSummary = within(
      screen.getByTestId(`contest-${mergedContest.id}`)
    );

    if (eitherNeitherVote) {
      contestVoteSummary.getByText(
        eitherNeitherVote === eitherNeitherContest.yesOption.id
          ? /for approval of either/i
          : /against both/i
      );
    }
    if (pickOneVote) {
      contestVoteSummary.getByText(
        pickOneVote === pickOneContest.yesOption.id
          ? /for initiative measure/i
          : /for alternative measure/i
      );
    }

    if (!eitherNeitherVote || !pickOneVote) {
      contestVoteSummary.getByText('You may still vote in this contest.');
    }
  });

  test('empty vote in interpretation result', () => {
    render(
      <Review
        contests={[mergedContest]}
        election={election}
        ballotStyle={election.ballotStyles[0]}
        selectionsAreEditable={false}
        precinctId={election.precincts[0].id}
        returnToContest={vi.fn()}
        votes={{}}
      />
    );

    within(screen.getByTestId(`contest-${mergedContest.id}`)).getByText(
      /no selection/i
    );
  });
});

describe('keyboard navigation', () => {
  test.each([['[Enter]'], ['[Space]']] as const)(
    '%s key activates contest review button',
    async (key) => {
      const contest = electionGeneral.contests.find(
        (c): c is CandidateContest => c.type === 'candidate'
      );
      assert(contest);
      const contests = [contest];
      const returnToContestStub = vi.fn();
      render(
        <Review
          election={electionGeneral}
          contests={contests}
          precinctId={electionGeneral.precincts[0].id}
          ballotStyle={electionGeneral.ballotStyles[0]}
          votes={{}}
          returnToContest={returnToContestStub}
        />
      );

      userEvent.tab();
      expect(
        await screen.findByTestId(`contest-wrapper-${contests[0].id}`)
      ).toHaveFocus();
      userEvent.keyboard(key);
      expect(returnToContestStub).toHaveBeenCalledTimes(1);
    }
  );
});

describe('cross-endorsed candidates', () => {
  test('shows single candidate once when voted for under one party', () => {
    const contest: CandidateContest = {
      type: 'candidate',
      id: 'governor',
      districtId: 'district-1',
      title: 'Governor',
      seats: 1,
      allowWriteIns: false,
      candidates: [
        {
          id: 'alice',
          name: 'Alice Anderson',
          partyIds: ['0', '1'],
        },
        { id: 'bob', name: 'Bob Brown', partyIds: ['2'] },
      ],
    };

    const election: Election = {
      ...electionGeneral,
      contests: [contest],
      ballotStyles: [
        {
          id: 'ballot-style-1',
          groupId: 'ballot-style-1',
          precincts: ['precinct-1'],
          districts: ['district-1'],
          orderedCandidatesByContest: {
            governor: [
              { id: 'alice', partyIds: ['0'] },
              { id: 'bob', partyIds: ['2'] },
              { id: 'alice', partyIds: ['1'] },
            ],
          },
        },
      ],
    };

    render(
      <Review
        election={election}
        contests={[contest]}
        precinctId={election.precincts[0].id}
        ballotStyle={election.ballotStyles[0]}
        votes={{
          governor: [{ id: 'alice', name: 'Alice Anderson', partyIds: ['0'] }],
        }}
        returnToContest={vi.fn()}
      />
    );

    // Alice should appear once in the review
    const aliceNames = screen.getAllByText('Alice Anderson');
    expect(aliceNames).toHaveLength(1);

    // Should show the party affiliation
    screen.getByText('Federalist');
  });

  test('calculates remaining votes correctly with cross-endorsed candidates', () => {
    const contest: CandidateContest = {
      type: 'candidate',
      id: 'council',
      districtId: 'district-1',
      title: 'City Council',
      seats: 3,
      allowWriteIns: false,
      candidates: [
        {
          id: 'alice',
          name: 'Alice Anderson',
          partyIds: ['0', '1'],
        },
        { id: 'bob', name: 'Bob Brown', partyIds: ['2'] },
        { id: 'carol', name: 'Carol Clark', partyIds: ['0'] },
      ],
    };

    const election: Election = {
      ...electionGeneral,
      contests: [contest],
      ballotStyles: [
        {
          id: 'ballot-style-1',
          groupId: 'ballot-style-1',
          precincts: ['precinct-1'],
          districts: ['district-1'],
          orderedCandidatesByContest: {
            council: [
              { id: 'alice', partyIds: ['0'] },
              { id: 'bob', partyIds: ['2'] },
              { id: 'alice', partyIds: ['1'] },
              { id: 'carol', partyIds: ['0'] },
            ],
          },
        },
      ],
    };

    render(
      <Review
        election={election}
        contests={[contest]}
        precinctId={election.precincts[0].id}
        ballotStyle={election.ballotStyles[0]}
        votes={{
          council: [
            { id: 'alice', name: 'Alice Anderson', partyIds: ['0'] },
            { id: 'alice', name: 'Alice Anderson', partyIds: ['1'] },
          ],
        }}
        returnToContest={vi.fn()}
      />
    );

    // Alice voted twice under different parties should count as 1 unique candidate
    // So with 3 seats and 1 unique candidate, should show 2 unused votes
    screen.getByText(hasTextAcrossElements(/number of unused votes: 2/i));
  });

  test('displays candidates in ballot style order with cross-endorsed candidates', () => {
    const contest: CandidateContest = {
      type: 'candidate',
      id: 'governor',
      districtId: 'district-1',
      title: 'Governor',
      seats: 2,
      allowWriteIns: false,
      candidates: [
        {
          id: 'alice',
          name: 'Alice Anderson',
          partyIds: ['0', '1'],
        },
        { id: 'bob', name: 'Bob Brown', partyIds: ['2'] },
      ],
    };

    const election: Election = {
      ...electionGeneral,
      contests: [contest],
      ballotStyles: [
        {
          id: 'ballot-style-1',
          groupId: 'ballot-style-1',
          precincts: ['precinct-1'],
          districts: ['district-1'],
          orderedCandidatesByContest: {
            governor: [
              { id: 'alice', partyIds: ['0'] },
              { id: 'bob', partyIds: ['2'] },
              { id: 'alice', partyIds: ['1'] },
            ],
          },
        },
      ],
    };

    render(
      <Review
        election={election}
        contests={[contest]}
        precinctId={election.precincts[0].id}
        ballotStyle={election.ballotStyles[0]}
        votes={{
          governor: [
            { id: 'alice', name: 'Alice Anderson', partyIds: ['1'] },
            { id: 'bob', name: 'Bob Brown', partyIds: ['2'] },
          ],
        }}
        returnToContest={vi.fn()}
      />
    );

    function escapeRegex(s: string) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    const nameRegex = new RegExp(
      `^(${contest.candidates.map((c) => escapeRegex(c.name)).join('|')})$`
    );
    const candidateNames = screen.getAllByText(nameRegex);

    // Bob should appear first, then Alice (in ballot style order)
    expect(candidateNames[0]).toHaveTextContent('Bob Brown');
    expect(candidateNames[1]).toHaveTextContent('Alice Anderson');
  });

  test('shows separate party affiliations when candidate selected under multiple parties', () => {
    const contest: CandidateContest = {
      type: 'candidate',
      id: 'governor',
      districtId: 'district-1',
      title: 'Governor',
      seats: 2,
      allowWriteIns: false,
      candidates: [
        {
          id: 'alice',
          name: 'Alice Anderson',
          partyIds: ['0', '1'],
        },
        { id: 'bob', name: 'Bob Brown', partyIds: ['2'] },
      ],
    };

    const election: Election = {
      ...electionGeneral,
      contests: [contest],
      ballotStyles: [
        {
          id: 'ballot-style-1',
          groupId: 'ballot-style-1',
          precincts: ['precinct-1'],
          districts: ['district-1'],
          orderedCandidatesByContest: {
            governor: [
              { id: 'alice', partyIds: ['0'] },
              { id: 'bob', partyIds: ['2'] },
              { id: 'alice', partyIds: ['1'] },
            ],
          },
        },
      ],
    };

    render(
      <Review
        election={election}
        contests={[contest]}
        precinctId={election.precincts[0].id}
        ballotStyle={election.ballotStyles[0]}
        votes={{
          governor: [
            { id: 'alice', name: 'Alice Anderson', partyIds: ['0'] },
            { id: 'alice', name: 'Alice Anderson', partyIds: ['1'] },
          ],
        }}
        returnToContest={vi.fn()}
      />
    );

    // Alice appears twice with different parties
    const aliceNames = screen.getAllByText('Alice Anderson');
    expect(aliceNames).toHaveLength(2);

    // Should show both party affiliations
    screen.getByText('Federalist');
    screen.getByText(/People/);
  });
});

describe('straight-party contest', () => {
  const PARTY_A = 'party-a';
  const PARTY_B = 'party-b';

  const spElection: Election = {
    ...electionGeneral,
    parties: [
      { id: PARTY_A, name: 'Party A', fullName: 'Party A', abbrev: 'A' },
      { id: PARTY_B, name: 'Party B', fullName: 'Party B', abbrev: 'B' },
    ],
    contests: [
      {
        id: 'straight-party',
        type: 'straight-party',
        title: 'Straight Party Ticket',
      },
      {
        id: 'president',
        type: 'candidate',
        title: 'President',
        districtId: electionGeneral.districts[0].id,
        seats: 1,
        allowWriteIns: false,
        candidates: [
          { id: 'alice', name: 'Alice', partyIds: [PARTY_A] },
          { id: 'bob', name: 'Bob', partyIds: [PARTY_B] },
        ],
      },
      {
        id: 'council',
        type: 'candidate',
        title: 'City Council',
        districtId: electionGeneral.districts[0].id,
        seats: 2,
        allowWriteIns: false,
        candidates: [
          { id: 'c1', name: 'Council A1', partyIds: [PARTY_A] },
          { id: 'c2', name: 'Council A2', partyIds: [PARTY_A] },
          { id: 'c3', name: 'Council B1', partyIds: [PARTY_B] },
        ],
      },
    ] as AnyContest[],
  };

  test('SP selection renders on review', () => {
    render(
      <Review
        election={spElection}
        contests={spElection.contests}
        precinctId={spElection.precincts[0].id}
        ballotStyle={spElection.ballotStyles[0]}
        votes={{
          'straight-party': [PARTY_A],
          president: [],
          council: [],
        }}
        returnToContest={vi.fn()}
      />
    );

    screen.getByText('Straight Party Ticket');
    // Party A appears multiple times (SP selection + indirect candidate party labels)
    const partyAs = screen.getAllByText('Party A');
    expect(partyAs.length).toBeGreaterThanOrEqual(1);

    // Verify SP selection is within the SP contest card
    const spCard = screen.getByTestId('contest-wrapper-straight-party');
    within(spCard).getByText('Party A');
  });

  test('undervote count accounts for SP indirect votes', () => {
    render(
      <Review
        election={spElection}
        contests={spElection.contests}
        precinctId={spElection.precincts[0].id}
        ballotStyle={spElection.ballotStyles[0]}
        votes={{
          'straight-party': [PARTY_A],
          president: [],
          council: [],
        }}
        returnToContest={vi.fn()}
      />
    );

    // President: 1 seat, 1 party-A candidate derived → no undervote warning
    const presidentCard = screen.getByTestId('contest-wrapper-president');
    expect(
      within(presidentCard).queryByText(/You may still vote/)
    ).not.toBeInTheDocument();
    expect(
      within(presidentCard).queryByText(/unused vote/i)
    ).not.toBeInTheDocument();

    // Council: 2 seats, 2 party-A candidates derived → no undervote warning
    const councilCard = screen.getByTestId('contest-wrapper-council');
    expect(
      within(councilCard).queryByText(/You may still vote/)
    ).not.toBeInTheDocument();
  });

  test('shows undervote when SP does not fully fill contest', () => {
    // Council has 2 seats but only 1 party-B candidate
    render(
      <Review
        election={spElection}
        contests={spElection.contests}
        precinctId={spElection.precincts[0].id}
        ballotStyle={spElection.ballotStyles[0]}
        votes={{
          'straight-party': [PARTY_B],
          president: [],
          council: [],
        }}
        returnToContest={vi.fn()}
      />
    );

    // President: 1 seat, 1 party-B candidate → no undervote
    const presidentCard = screen.getByTestId('contest-wrapper-president');
    expect(
      within(presidentCard).queryByText(/unused vote/i)
    ).not.toBeInTheDocument();

    // Council: 2 seats, only 1 party-B candidate → 1 unused vote
    const councilCard = screen.getByTestId('contest-wrapper-council');
    within(councilCard).getByText(
      hasTextAcrossElements(/number of unused votes: 1/i)
    );
  });

  test('indirect candidates shown on review with SP label', () => {
    render(
      <Review
        election={spElection}
        contests={spElection.contests}
        precinctId={spElection.precincts[0].id}
        ballotStyle={spElection.ballotStyles[0]}
        votes={{
          'straight-party': [PARTY_A],
          president: [],
          council: [],
        }}
        returnToContest={vi.fn()}
      />
    );

    // Indirect candidates should be listed
    screen.getByText('Alice');
    screen.getByText('Council A1');
    screen.getByText('Council A2');
  });
});
