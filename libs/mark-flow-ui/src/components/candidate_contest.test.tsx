import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CandidateContest as TypeCandidateContest,
  CandidateContest as CandidateContestInterface,
  CandidateVote,
  getCandidateParties,
  Candidate,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';

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
import { screen, within, render, act } from '../../test/react_testing_library';
import { CandidateContest } from './candidate_contest';
import { UpdateVoteFunction } from '../config/types';

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

  test('prevents writing more than the allowed number of characters', () => {
    const { checkIsKeyDisabled, fireKeyPressEvents } =
      setUpMockVirtualKeyboard();

    const updateVote = vi.fn();
    render(
      <CandidateContest
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
    const writeInCandidate =
      "JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, THAT'S MY NAME TOO";
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
        id: 'write-in-jacobJohansonJingleheimmerSchmidttT',
        isWriteIn: true,
        name: 'JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, T',
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
        election={electionDefinition.election}
        contest={twoSeatContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    updateVote.mockImplementation((_, votes) => {
      rerender(
        <CandidateContest
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
