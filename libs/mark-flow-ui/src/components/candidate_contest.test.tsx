import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CandidateContest as TypeCandidateContest,
  CandidateContest as CandidateContestInterface,
  CandidateVote,
  getCandidateParties,
  Candidate,
  CandidateContest as CandidateContestData,
  Election,
} from '@votingworks/types';
import {
  readElectionGeneralDefinition,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';

import userEvent from '@testing-library/user-event';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import {
  ACCEPT_KEY,
  AccessibilityMode,
  CANCEL_KEY,
  DELETE_KEY,
  SPACE_BAR_KEY,
  VirtualKeyboard,
  virtualKeyboardCommon,
  VirtualKeyboardProps,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { screen, within, render, act } from '../../test/react_testing_library';
import { CandidateContest } from './candidate_contest';
import { UpdateVoteFunction } from '../config/types';
import { WRITE_IN_CANDIDATE_MAX_LENGTH } from '../config/globals';

vi.mock('@votingworks/ui', async () => {
  const ui = await vi.importActual('@votingworks/ui');
  return {
    ...ui,
    VirtualKeyboard: vi.fn(),
  };
});

function setUpMockVirtualKeyboard() {
  let checkIsKeyDisabled: (key: virtualKeyboardCommon.Key) => boolean;
  let fireBackspaceEvent: () => void;
  let fireKeyPressEvent: (key: string) => void;

  vi.mocked(VirtualKeyboard)
    .mockReset()
    .mockImplementation((props: VirtualKeyboardProps) => {
      const { keyDisabled, onBackspace, onKeyPress } = props;

      checkIsKeyDisabled = keyDisabled;
      fireBackspaceEvent = onBackspace;
      fireKeyPressEvent = onKeyPress;

      return <div data-testid="MockVirtualKeyboard" />;
    });

  return {
    checkIsKeyDisabled: (key: virtualKeyboardCommon.Key) =>
      checkIsKeyDisabled(key),
    fireBackspaceEvent: () => act(() => fireBackspaceEvent()),
    fireKeyPressEvents: (chars: string) =>
      act(() => {
        for (const char of chars) {
          fireKeyPressEvent(char);
        }
      }),
  };
}

const electionDefinition = readElectionGeneralDefinition();

const candidateContest = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate'
)!;

const candidateContestWithMultipleSeats: CandidateContestInterface = {
  ...electionDefinition.election.contests.find(
    (c): c is CandidateContestInterface => c.type === 'candidate' && c.seats > 1
  )!,
  seats: 4,
};

const candidateContestWithWriteIns = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate' && c.allowWriteIns
)! as CandidateContestInterface;

beforeEach(() => {
  vi.useFakeTimers();
  setUpMockVirtualKeyboard();
});

test('shows up-to-date vote counter - single-seat contest', () => {
  const updateVote = vi.fn();
  const { rerender } = render(
    <CandidateContest
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      election={electionDefinition.election}
      contest={candidateContest}
      vote={[]}
      updateVote={updateVote}
    />
  );

  screen.getByText(
    hasTextAcrossElements(/votes remaining in this contest: 1/i)
  );

  rerender(
    <CandidateContest
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      election={electionDefinition.election}
      contest={candidateContest}
      vote={[candidateContest.candidates[0]]}
      updateVote={updateVote}
    />
  );

  screen.getByText(
    hasTextAcrossElements(/votes remaining in this contest: 0/i)
  );
});

test('shows up-to-date vote counter - multi-seat contest', () => {
  const updateVote = vi.fn();
  const { rerender } = render(
    <CandidateContest
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      election={electionDefinition.election}
      contest={candidateContestWithMultipleSeats}
      vote={[]}
      updateVote={updateVote}
    />
  );

  screen.getByText(
    hasTextAcrossElements(/votes remaining in this contest: 4/i)
  );

  rerender(
    <CandidateContest
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      election={electionDefinition.election}
      contest={candidateContestWithMultipleSeats}
      vote={[
        candidateContestWithMultipleSeats.candidates[0],
        candidateContestWithMultipleSeats.candidates[1],
      ]}
      updateVote={updateVote}
    />
  );

  screen.getByText(
    hasTextAcrossElements(/votes remaining in this contest: 2/i)
  );
});

describe('supports single-seat contest', () => {
  test('allows any candidate to be selected when no candidate is selected', () => {
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    userEvent.click(
      screen.getByText(candidateContest.candidates[0].name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(1);

    userEvent.click(
      screen.getByText(candidateContest.candidates[1].name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(2);

    userEvent.click(
      screen.getByText(candidateContest.candidates[2].name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(3);
  });

  test('advances focus to "Next" button when selection is made with accessible device', () => {
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    const candidateButton = screen
      .getByText(candidateContest.candidates[0].name)
      .closest('button')!;
    candidateButton.focus();
    expect(candidateButton).toHaveFocus();
    userEvent.keyboard('[Enter]');
    expect(updateVote).toHaveBeenCalledTimes(1);
    expect(updateVote).toHaveBeenCalledWith(candidateContest.id, [
      {
        id: candidateContest.candidates[0].id,
        name: candidateContest.candidates[0].name,
        partyIds: candidateContest.candidates[0].partyIds,
      },
    ]);
  });

  test("doesn't allow other candidates to be selected when a candidate is selected", () => {
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[candidateContest.candidates[0]]}
        updateVote={updateVote}
      />
    );

    screen.getByRole('option', {
      name: new RegExp(candidateContest.candidates[0].name),
      selected: true,
    });

    userEvent.click(
      screen.getByText(candidateContest.candidates[1].name).closest('button')!
    );
    expect(updateVote).not.toHaveBeenCalled();

    userEvent.click(
      screen.getByText(candidateContest.candidates[2].name).closest('button')!
    );
    expect(updateVote).not.toHaveBeenCalled();

    userEvent.click(
      screen.getByText(candidateContest.candidates[0].name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalled();
  });
});

describe('supports multi-seat contests', () => {
  test('allows a second candidate to be selected when one is selected', () => {
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithMultipleSeats}
        vote={[candidateContestWithMultipleSeats.candidates[0]]}
        updateVote={updateVote}
      />
    );

    screen.getByRole('option', {
      name: new RegExp(candidateContestWithMultipleSeats.candidates[0].name),
      selected: true,
    });
    screen.getByRole('option', {
      name: new RegExp(candidateContestWithMultipleSeats.candidates[1].name),
      selected: false,
    });
    screen.getByRole('option', {
      name: new RegExp(candidateContestWithMultipleSeats.candidates[2].name),
      selected: false,
    });

    userEvent.click(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[1].name)
        .closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(1);

    userEvent.click(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[2].name)
        .closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(2);

    userEvent.click(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[0].name)
        .closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(3);
  });
});

describe('supports write-in candidates', () => {
  test('updates votes when a write-in candidate is selected', () => {
    const { fireBackspaceEvent, fireKeyPressEvents } =
      setUpMockVirtualKeyboard();

    const mockOnOpenWriteInKeyboard = vi.fn();
    const mockOnCloseWriteInKeyboard = vi.fn();
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
        onOpenWriteInKeyboard={mockOnOpenWriteInKeyboard}
        onCloseWriteInKeyboard={mockOnCloseWriteInKeyboard}
      />
    );
    expect(mockOnOpenWriteInKeyboard).not.toHaveBeenCalled();
    userEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );

    const modal = within(screen.getByRole('alertdialog'));
    expect(mockOnOpenWriteInKeyboard).toHaveBeenCalled();

    modal.getByRole('heading', {
      name: `Write-In: ${candidateContestWithWriteIns.title}`,
    });
    modal.getByText(hasTextAcrossElements(/characters remaining: 40/i));

    // type LIZARD PEOPLE, then backspace to remove the E, then add it back
    fireKeyPressEvents('LIZARD PEOPLE');
    fireBackspaceEvent();
    modal.getByText(hasTextAcrossElements(/characters remaining: 28/i));
    fireKeyPressEvents('E');
    modal.getByText(hasTextAcrossElements(/characters remaining: 27/i));

    expect(mockOnCloseWriteInKeyboard).not.toHaveBeenCalled();
    userEvent.click(modal.getByText('Accept'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockOnCloseWriteInKeyboard).toHaveBeenCalled();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      {
        id: 'write-in-lizardPeople',
        isWriteIn: true,
        name: 'LIZARD PEOPLE',
        writeInIndex: 0,
      },
    ]);
  });

  test('calls cancel and accept handlers when buttons are pressed', () => {
    const { fireBackspaceEvent, fireKeyPressEvents } =
      setUpMockVirtualKeyboard();

    const mockOnOpenWriteInKeyboard = vi.fn();
    const mockOnCloseWriteInKeyboard = vi.fn();
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
        onOpenWriteInKeyboard={mockOnOpenWriteInKeyboard}
        onCloseWriteInKeyboard={mockOnCloseWriteInKeyboard}
      />
    );
    expect(mockOnOpenWriteInKeyboard).not.toHaveBeenCalled();
    userEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );

    const modal = within(screen.getByRole('alertdialog'));
    expect(mockOnOpenWriteInKeyboard).toHaveBeenCalled();

    modal.getByRole('heading', {
      name: `Write-In: ${candidateContestWithWriteIns.title}`,
    });
    modal.getByText(hasTextAcrossElements(/characters remaining: 40/i));

    // type LIZARD PEOPLE, then backspace to remove the E, then add it back
    fireKeyPressEvents('LIZARD PEOPLE');
    fireBackspaceEvent();
    modal.getByText(hasTextAcrossElements(/characters remaining: 28/i));
    fireKeyPressEvents('E');
    modal.getByText(hasTextAcrossElements(/characters remaining: 27/i));

    expect(mockOnCloseWriteInKeyboard).not.toHaveBeenCalled();
    userEvent.click(modal.getByText('Accept'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockOnCloseWriteInKeyboard).toHaveBeenCalled();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      {
        id: 'write-in-lizardPeople',
        isWriteIn: true,
        name: 'LIZARD PEOPLE',
        writeInIndex: 0,
      },
    ]);
  });

  test('renders a virtual keyboard with scan panels when switch scanning is enabled', () => {
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
        accessibilityMode={AccessibilityMode.SWITCH_SCANNING}
      />
    );
    userEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );

    const modal = within(screen.getByRole('alertdialog'));

    modal.getByRole('heading', {
      name: `Write-In: ${candidateContestWithWriteIns.title}`,
    });
    modal.getByText(hasTextAcrossElements(/characters remaining: 40/i));
    // The default VirtualKeyboard doesn't have a button with text equal
    // to the entire keyboard row
    modal.getButton('Q W E R T Y U I O P');
  });

  test('displays warning when deselecting a write-in candidate', () => {
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithWriteIns}
        vote={[
          {
            id: 'write-in-lizardPeople',
            isWriteIn: true,
            name: 'LIZARD PEOPLE',
          },
        ]}
        updateVote={updateVote}
      />
    );
    userEvent.click(screen.getByText('LIZARD PEOPLE').closest('button')!);

    const modal = within(screen.getByRole('alertdialog'));
    modal.getByText(/do you want to deselect/i);
    userEvent.click(modal.getByText('Yes'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(updateVote).toHaveBeenCalledWith(
      candidateContestWithWriteIns.id,
      []
    );
  });

  test('displays warning if write-in candidate name is too long', () => {
    const { fireKeyPressEvents } = setUpMockVirtualKeyboard();

    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
      />
    );
    userEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );

    const modal = within(screen.getByRole('alertdialog'));

    modal.getByRole('heading', {
      name: `Write-In: ${candidateContestWithWriteIns.title}`,
    });
    fireKeyPressEvents('JACOB JOHANSON JINGLEHEIMMER SCHMIDTT');
    modal.getByText(hasTextAcrossElements(/characters remaining: 3/i));
    userEvent.click(modal.getByText('Cancel'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('displays a warning when attempting to add more write-in candidates than seats', () => {
    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithWriteIns}
        vote={Array.from({ length: candidateContestWithWriteIns.seats }).map(
          (_, i) => ({
            id: `write-in-lizardPeople-${i}`,
            isWriteIn: true,
            name: 'LIZARD PEOPLE',
          })
        )}
        updateVote={updateVote}
      />
    );
    userEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );

    const modal = within(screen.getByRole('alertdialog'));
    modal.getByText(/you must first deselect/i);
    userEvent.click(modal.getByText('Continue'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test.each([
    {
      writeInCharacterLimitAcrossContests: undefined,
    },
    {
      writeInCharacterLimitAcrossContests: {
        numCharactersAllowed: Infinity,
        numCharactersRemaining: Infinity,
      },
    },
    {
      writeInCharacterLimitAcrossContests: {
        numCharactersAllowed: WRITE_IN_CANDIDATE_MAX_LENGTH * 2,
        numCharactersRemaining: WRITE_IN_CANDIDATE_MAX_LENGTH * 2,
      },
    },
    {
      writeInCharacterLimitAcrossContests: {
        numCharactersAllowed: WRITE_IN_CANDIDATE_MAX_LENGTH * 2,
        numCharactersRemaining: WRITE_IN_CANDIDATE_MAX_LENGTH,
      },
    },
  ])(
    'prevents writing more than the allowed number of characters (when the write-in character limit across contests is not the limiting factor)',
    ({ writeInCharacterLimitAcrossContests }) => {
      const { checkIsKeyDisabled, fireKeyPressEvents } =
        setUpMockVirtualKeyboard();

      const updateVote = vi.fn();
      render(
        <CandidateContest
          ballotStyleId={electionDefinition.election.ballotStyles[0].id}
          election={electionDefinition.election}
          contest={candidateContestWithWriteIns}
          vote={[]}
          updateVote={updateVote}
          writeInCharacterLimitAcrossContests={
            writeInCharacterLimitAcrossContests
          }
        />
      );
      userEvent.click(
        screen.getByText('add write-in candidate').closest('button')!
      );

      const modal = within(screen.getByRole('alertdialog'));

      modal.getByRole('heading', {
        name: `Write-In: ${candidateContestWithWriteIns.title}`,
      });
      const writeInCandidate =
        "JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, THAT'S MY NAME TOO";
      fireKeyPressEvents(writeInCandidate);
      modal.getByText(hasTextAcrossElements(/characters remaining: 0/i));
      expect(
        modal.queryByText(
          hasTextAcrossElements(/write-in character limit across contests/i)
        )
      ).not.toBeInTheDocument();

      expect(checkIsKeyDisabled(SPACE_BAR_KEY)).toEqual(true);
      expect(checkIsKeyDisabled(DELETE_KEY)).toEqual(false);
      expect(checkIsKeyDisabled(CANCEL_KEY)).toEqual(false);
      expect(checkIsKeyDisabled(ACCEPT_KEY)).toEqual(false);
      userEvent.click(modal.getByText('Accept'));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

      expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
        {
          id: 'write-in-jacobJohansonJingleheimmerSchmidttT',
          isWriteIn: true,
          name: 'JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, T',
          writeInIndex: 0,
        },
      ]);
    }
  );

  test('prevents writing more than the allowed number of characters (when the write-in character limit across contests is the limiting factor)', () => {
    const { checkIsKeyDisabled, fireKeyPressEvents } =
      setUpMockVirtualKeyboard();

    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
        writeInCharacterLimitAcrossContests={{
          numCharactersAllowed: WRITE_IN_CANDIDATE_MAX_LENGTH * 2,
          numCharactersRemaining: 3,
        }}
      />
    );
    userEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );

    const modal = within(screen.getByRole('alertdialog'));

    modal.getByRole('heading', {
      name: `Write-In: ${candidateContestWithWriteIns.title}`,
    });
    modal.getByText(hasTextAcrossElements(/characters remaining: 3/i));
    modal.getByText(
      hasTextAcrossElements(/write-in character limit across contests: 80/i)
    );
    const writeInCandidate = 'ABC';
    fireKeyPressEvents(writeInCandidate);
    modal.getByText(hasTextAcrossElements(/characters remaining: 0/i));

    expect(checkIsKeyDisabled(SPACE_BAR_KEY)).toEqual(true);
    expect(checkIsKeyDisabled(DELETE_KEY)).toEqual(false);
    expect(checkIsKeyDisabled(CANCEL_KEY)).toEqual(false);
    expect(checkIsKeyDisabled(ACCEPT_KEY)).toEqual(false);
    userEvent.click(modal.getByText('Accept'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      {
        id: 'write-in-abc',
        isWriteIn: true,
        name: 'ABC',
        writeInIndex: 0,
      },
    ]);
  });

  test('maintains sequential write-in indices', () => {
    const { fireKeyPressEvents } = setUpMockVirtualKeyboard();

    const contest: TypeCandidateContest = {
      ...candidateContestWithWriteIns,
      seats: 4,
    };

    const mockOnOpenWriteInKeyboard = vi.fn();
    const mockOnCloseWriteInKeyboard = vi.fn();

    const votes: Candidate[] = [];
    const updateVote = vi.fn((_, candidates) => {
      votes.length = 0;
      votes.push(...candidates);
    });

    render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={contest}
        vote={votes}
        updateVote={updateVote}
        onOpenWriteInKeyboard={mockOnOpenWriteInKeyboard}
        onCloseWriteInKeyboard={mockOnCloseWriteInKeyboard}
      />
    );

    function selectCandidate(candidate: Candidate) {
      userEvent.click(screen.getByText(candidate.name, { exact: false }));
    }

    function addWriteIn(writeInName: string) {
      userEvent.click(screen.getByText('add write-in candidate'));
      fireKeyPressEvents(writeInName);
      userEvent.click(screen.getButton('Accept'));
    }

    addWriteIn('FOO');
    selectCandidate(contest.candidates[0]);
    addWriteIn('BAR');
    addWriteIn('BAZ');
    expect(votes).toEqual([
      { id: 'write-in-foo', isWriteIn: true, name: 'FOO', writeInIndex: 0 },
      contest.candidates[0],
      { id: 'write-in-bar', isWriteIn: true, name: 'BAR', writeInIndex: 1 },
      { id: 'write-in-baz', isWriteIn: true, name: 'BAZ', writeInIndex: 2 },
    ]);

    userEvent.click(screen.getByRole('option', { name: /BAR/ }));
    userEvent.click(screen.getButton('Yes'));
    expect(votes).toEqual([
      { id: 'write-in-foo', isWriteIn: true, name: 'FOO', writeInIndex: 0 },
      contest.candidates[0],
      { id: 'write-in-baz', isWriteIn: true, name: 'BAZ', writeInIndex: 1 },
    ]);
  });
});

describe('audio cues', () => {
  test('updates the screen reader text to indicate selection state', () => {
    const updateVote = vi.fn<UpdateVoteFunction>();
    const twoSeatContest: CandidateContestInterface = {
      ...candidateContest,
      seats: 2,
    };

    const { rerender } = render(
      <CandidateContest
        ballotStyleId={electionDefinition.election.ballotStyles[0].id}
        election={electionDefinition.election}
        contest={twoSeatContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    updateVote.mockImplementation((_, votes) => {
      rerender(
        <CandidateContest
          ballotStyleId={electionDefinition.election.ballotStyles[0].id}
          election={electionDefinition.election}
          contest={twoSeatContest}
          vote={votes as CandidateVote}
          updateVote={updateVote}
        />
      );
    });

    const [candidateA, candidateB] = twoSeatContest.candidates;
    const firstCandidateChoice = screen.getByRole('option', {
      name: new RegExp(candidateA.name),
      selected: false,
    });

    // initially, the candidate is not selected
    expect(firstCandidateChoice).toHaveAccessibleName(
      expect.stringContaining(candidateA.name)
    );

    // select the first candidate to update the vote and trigger audio prompt:
    userEvent.click(firstCandidateChoice);
    screen.getByRole('option', {
      name: new RegExp(`Selected.+${candidateA.name}.+votes remaining.+1`, 'i'),
      selected: true,
    });

    //
    // Expect the "votes remaining" suffix to get cleared after a moment:
    //

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const lastCandidateParty = getCandidateParties(
      electionDefinition.election.parties,
      candidateA
    ).slice(-1)[0];

    screen.getByRole('option', {
      name: new RegExp(
        `^Selected.+${candidateA.name}.+${lastCandidateParty.name}$`,
        'i'
      ),
      selected: true,
    });

    // select the second candidate:
    const secondCandidateChoice = screen.getByRole('option', {
      name: new RegExp(candidateB.name),
      selected: false,
    });

    userEvent.click(secondCandidateChoice);

    screen.getByRole('option', {
      name: new RegExp(
        `Selected.+${candidateB.name}.+you've completed your selections`,
        'i'
      ),
      selected: true,
    });

    // deselect the first candidate:
    userEvent.click(firstCandidateChoice);
    screen.getByRole('option', {
      name: new RegExp(
        `Deselected.+${candidateA.name}.+votes remaining.+1`,
        'i'
      ),
      selected: false,
    });

    //
    // Expect the "deselected" audio prefix and "votes remaining" suffix to get
    // cleared after a moment:
    //

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    screen.getByRole('option', {
      name: new RegExp(`^${candidateA.name}.+${lastCandidateParty.name}$`, 'i'),
      selected: false,
    });
  });
});

test('shows term description, if available', () => {
  let contest: CandidateContestData | undefined;

  const election: Election = {
    ...electionDefinition.election,
    contests: electionDefinition.election.contests.map((c) => {
      if (c.type !== 'candidate' || !c.title.includes('President')) {
        return c;
      }

      contest = { ...c, termDescription: '4 Years' };
      return contest;
    }),
  };

  assert(contest);

  render(
    <CandidateContest
      ballotStyleId={electionDefinition.election.ballotStyles[0].id}
      election={election}
      contest={contest}
      vote={[]}
      updateVote={vi.fn()}
    />
  );

  screen.getByText(hasTextAcrossElements('4 Years'));
});

describe('candidate ordering', () => {
  test('renders candidates in order specified by ballot style using electionFamousNames fixture', () => {
    const famousNamesElection =
      electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElection();

    // Get the mayor contest and disable write-ins for cleaner test
    const mayorContest: CandidateContestInterface = {
      ...(famousNamesElection.contests.find(
        (c) => c.id === 'mayor'
      ) as CandidateContestInterface),
      allowWriteIns: false,
    };

    // Ballot style 1-1 has order: sherlock-holmes, thomas-edison
    render(
      <CandidateContest
        ballotStyleId="1-1"
        election={famousNamesElection}
        contest={mayorContest}
        vote={[]}
        updateVote={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('option');
    expect(buttons).toHaveLength(3);

    // Check that candidates appear in ballot style 1-1 order
    within(buttons[0]).getByText('Sherlock Holmes');
    within(buttons[1]).getByText('Sherlock Holmes');
    within(buttons[2]).getByText('Thomas Edison');
  });

  test('renders candidates in different order for different ballot style', () => {
    const famousNamesElection =
      electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElection();

    // Get the mayor contest and disable write-ins for cleaner test
    const mayorContest: CandidateContestInterface = {
      ...(famousNamesElection.contests.find(
        (c) => c.id === 'mayor'
      ) as CandidateContestInterface),
      allowWriteIns: false,
    };

    // Ballot style 1-2 has order: sherlock-homes-liberty, thomas-edison, sherlock-holmes-dem (reversed)
    render(
      <CandidateContest
        ballotStyleId="1-2"
        election={famousNamesElection}
        contest={mayorContest}
        vote={[]}
        updateVote={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('option');
    expect(buttons).toHaveLength(3);

    // Check that candidates appear in ballot style 1-2 order
    within(buttons[0]).getByText('Sherlock Holmes');
    within(buttons[1]).getByText('Thomas Edison');
    within(buttons[2]).getByText('Sherlock Holmes');
  });

  test('renders candidates in rotated order for multi-candidate contest', () => {
    const famousNamesElection =
      electionFamousNames2021Fixtures.baseElection_DEPRECATED.readElection();

    // Get the controller contest (has 3 candidates) and disable write-ins
    const controllerContest: CandidateContestInterface = {
      ...(famousNamesElection.contests.find(
        (c) => c.id === 'controller'
      ) as CandidateContestInterface),
      allowWriteIns: false,
    };

    // Ballot style 1-1 has order: winston-churchill, oprah-winfrey, louis-armstrong
    render(
      <CandidateContest
        ballotStyleId="1-1"
        election={famousNamesElection}
        contest={controllerContest}
        vote={[]}
        updateVote={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('option');
    expect(buttons).toHaveLength(3);
    within(buttons[0]).getByText('Winston Churchill');
    within(buttons[1]).getByText('Oprah Winfrey');
    within(buttons[2]).getByText('Louis Armstrong');
  });

  test('uses original candidate order when no ordering specified for ballot style', () => {
    const contest: CandidateContestInterface = {
      type: 'candidate',
      id: 'mayor',
      districtId: 'district-1',
      title: 'Mayor',
      seats: 1,
      allowWriteIns: false,
      candidates: [
        { id: 'alice', name: 'Alice', partyIds: ['0'] },
        { id: 'bob', name: 'Bob', partyIds: ['1'] },
        { id: 'carol', name: 'Carol', partyIds: ['2'] },
      ],
    };

    const election: Election = {
      ...electionDefinition.election,
      contests: [contest],
      ballotStyles: [
        {
          id: 'ballot-style-1',
          groupId: 'ballot-style-1',
          precincts: ['precinct-1'],
          districts: ['district-1'],
          // No candidatesOrderedByContest specified
        },
      ],
    };

    render(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[]}
        updateVote={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('option');
    expect(buttons).toHaveLength(3);

    // Check that candidates appear in original order
    within(buttons[0]).getByText('Alice');
    within(buttons[1]).getByText('Bob');
    within(buttons[2]).getByText('Carol');
  });
});

describe('cross-endorsed candidates', () => {
  test('renders separate bubbles when cross-endorsed candidate appears as multiple ordered options', () => {
    const contest: CandidateContestInterface = {
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
          partyIds: ['0', '1'], // Cross-endorsed by Democrat and Republican
        },
        { id: 'bob', name: 'Bob Brown', partyIds: ['2'] },
      ],
    };

    const election: Election = {
      ...electionDefinition.election,
      contests: [contest],
      ballotStyles: [
        {
          id: 'ballot-style-1',
          groupId: 'ballot-style-1',
          precincts: ['precinct-1'],
          districts: ['district-1'],
          orderedCandidatesByContest: {
            governor: [
              { id: 'alice', partyIds: ['0'] }, // Alice as Democrat
              { id: 'bob', partyIds: ['2'] },
              { id: 'alice', partyIds: ['1'] }, // Alice as Republican
            ],
          },
        },
      ],
    };

    render(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[]}
        updateVote={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('option');
    expect(buttons).toHaveLength(3);

    // Check that Alice appears twice with different party affiliations
    within(buttons[0]).getByText('Alice Anderson');
    within(buttons[0]).getByText('Federalist');
    expect(within(buttons[0]).queryByText(/People/)).not.toBeInTheDocument();

    within(buttons[1]).getByText('Bob Brown');
    within(buttons[1]).getByText('Liberty');

    within(buttons[2]).getByText('Alice Anderson');
    within(buttons[2]).getByText(/People/);
    expect(
      within(buttons[2]).queryByText('Federalist')
    ).not.toBeInTheDocument();
  });

  test('renders single bubble with both parties when cross-endorsed candidate appears as one ordered option', () => {
    const contest: CandidateContestInterface = {
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
          partyIds: ['0', '1'], // Cross-endorsed by Democrat and Republican
        },
        { id: 'bob', name: 'Bob Brown', partyIds: ['2'] },
      ],
    };

    const election: Election = {
      ...electionDefinition.election,
      contests: [contest],
      ballotStyles: [
        {
          id: 'ballot-style-1',
          groupId: 'ballot-style-1',
          precincts: ['precinct-1'],
          districts: ['district-1'],
          orderedCandidatesByContest: {
            governor: [
              { id: 'alice', partyIds: ['0', '1'] }, // Alice with both parties
              { id: 'bob', partyIds: ['2'] },
            ],
          },
        },
      ],
    };

    render(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[]}
        updateVote={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('option');
    expect(buttons).toHaveLength(2);

    // Check that Alice appears once with both party affiliations
    within(buttons[0]).getByText('Alice Anderson');
    within(buttons[0]).getByText('Federalist');
    within(buttons[0]).getByText(/People/);

    within(buttons[1]).getByText('Bob Brown');
    within(buttons[1]).getByText('Liberty');
  });

  test('selecting cross-endorsed candidate stores specific party IDs from selected option', () => {
    const contest: CandidateContestInterface = {
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
      ...electionDefinition.election,
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

    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    const buttons = screen.getAllByRole('option');

    // Click first Alice option (as Democrat - party 0)
    userEvent.click(buttons[0]);

    expect(updateVote).toHaveBeenCalledWith('governor', [
      {
        id: 'alice',
        name: 'Alice Anderson',
        partyIds: ['0'], // Only party 0, not both
      },
    ]);
  });

  test('selecting cross-endorsed candidate as different party stores different party ID', () => {
    const contest: CandidateContestInterface = {
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
      ...electionDefinition.election,
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

    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    const buttons = screen.getAllByRole('option');

    // Click third Alice option (as Republican - party 1)
    userEvent.click(buttons[2]);

    expect(updateVote).toHaveBeenCalledWith('governor', [
      {
        id: 'alice',
        name: 'Alice Anderson',
        partyIds: ['1'], // Only party 1
      },
    ]);
  });

  test('deselecting a specific cross-endorsed option removes only that option', () => {
    const contest: CandidateContestInterface = {
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
      ...electionDefinition.election,
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

    const updateVote = vi.fn();
    render(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[{ id: 'alice', name: 'Alice Anderson', partyIds: ['0'] }]}
        updateVote={updateVote}
      />
    );

    const buttons = screen.getAllByRole('option');

    // First Alice option should be selected
    screen.getByRole('option', {
      name: /Selected.*Alice Anderson.*Federalist/,
      selected: true,
    });

    // Click to deselect
    userEvent.click(buttons[0]);

    expect(updateVote).toHaveBeenCalledWith('governor', []);
  });

  test('in multi-seat contest, cross-endorsed candidate can be selected under different parties without triggering overvote', () => {
    const contest: CandidateContestInterface = {
      type: 'candidate',
      id: 'council',
      districtId: 'district-1',
      title: 'City Council',
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
      ...electionDefinition.election,
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
            ],
          },
        },
      ],
    };

    const updateVote = vi.fn();
    const { rerender } = render(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    const buttons = screen.getAllByRole('option');

    // Select Alice as Democrat
    userEvent.click(buttons[0]);
    expect(updateVote).toHaveBeenCalledWith('council', [
      { id: 'alice', name: 'Alice Anderson', partyIds: ['0'] },
    ]);

    // Update the component with the vote
    rerender(
      <CandidateContest
        ballotStyleId="ballot-style-1"
        election={election}
        contest={contest}
        vote={[{ id: 'alice', name: 'Alice Anderson', partyIds: ['0'] }]}
        updateVote={updateVote}
      />
    );

    const updatedButtons = screen.getAllByRole('option');

    // Alice as Republican should still be enabled (not disabled) since they count as same candidate
    expect(updatedButtons[2]).not.toHaveAttribute('disabled');

    // Should still show 1 vote remaining (not 0) because Alice is one unique candidate
    const voteCounterElements = screen.getAllByText(
      hasTextAcrossElements(/votes remaining in this contest: 1/i)
    );
    // Should find at least one element showing the vote counter
    expect(voteCounterElements.length).toBeGreaterThan(0);
  });
});
