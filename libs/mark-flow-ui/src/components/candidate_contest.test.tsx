import {
  CandidateContest as CandidateContestInterface,
  getCandidateParties,
} from '@votingworks/types';
import { electionGeneralDefinition } from '@votingworks/fixtures';

import { act } from 'react-dom/test-utils';
import userEvent from '@testing-library/user-event';
import {
  advanceTimers,
  advanceTimersAndPromises,
  hasTextAcrossElements,
  mockOf,
} from '@votingworks/test-utils';
import { VirtualKeyboard, VirtualKeyboardProps } from '@votingworks/ui';
import { screen, within, render } from '../../test/react_testing_library';
import { CandidateContest } from './candidate_contest';

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  VirtualKeyboard: jest.fn(),
}));

function setUpMockVirtualKeyboard() {
  let checkIsKeyDisabled: (key: string) => boolean;
  let fireBackspaceEvent: () => void;
  let fireKeyPressEvent: (key: string) => void;

  mockOf(VirtualKeyboard)
    .mockReset()
    .mockImplementation((props: VirtualKeyboardProps) => {
      const { keyDisabled, onBackspace, onKeyPress } = props;

      checkIsKeyDisabled = keyDisabled;
      fireBackspaceEvent = onBackspace;
      fireKeyPressEvent = onKeyPress;

      return <div data-testid="MockVirtualKeyboard" />;
    });

  return {
    checkIsKeyDisabled: (key: string) => checkIsKeyDisabled(key),
    fireBackspaceEvent: () => act(() => fireBackspaceEvent()),
    fireKeyPressEvents: (chars: string) =>
      act(() => {
        for (const char of chars) {
          fireKeyPressEvent(char);
        }
      }),
  };
}

const electionDefinition = electionGeneralDefinition;

const candidateContest = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate'
)! as CandidateContestInterface;

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
  jest.useFakeTimers();
  setUpMockVirtualKeyboard();
});

test('shows up-to-date vote counter - single-seat contest', () => {
  const updateVote = jest.fn();
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
  const updateVote = jest.fn();
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
    const updateVote = jest.fn();
    render(
      <CandidateContest
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    userEvent.click(
      screen.getByText(candidateContest.candidates[0]!.name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(1);

    userEvent.click(
      screen.getByText(candidateContest.candidates[1]!.name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(2);

    userEvent.click(
      screen.getByText(candidateContest.candidates[2]!.name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(3);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  test('advances focus to "Next" button when selection is made with accessible device', async () => {
    const updateVote = jest.fn();
    render(
      <CandidateContest
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    const candidateButton = screen
      .getByText(candidateContest.candidates[0]!.name)
      .closest('button')!;
    candidateButton.focus();
    await advanceTimersAndPromises();
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
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  test("doesn't allow other candidates to be selected when a candidate is selected", () => {
    const updateVote = jest.fn();
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

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});

describe('supports multi-seat contests', () => {
  test('allows a second candidate to be selected when one is selected', () => {
    const updateVote = jest.fn();
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

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});

describe('supports write-in candidates', () => {
  test('updates votes when a write-in candidate is selected', () => {
    const { fireBackspaceEvent, fireKeyPressEvents } =
      setUpMockVirtualKeyboard();

    const updateVote = jest.fn();
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
    modal.getByText(hasTextAcrossElements(/characters remaining: 40/i));

    // type LIZARD PEOPLE, then backspace to remove the E, then add it back
    fireKeyPressEvents('LIZARD PEOPLE');
    fireBackspaceEvent();
    modal.getByText(hasTextAcrossElements(/characters remaining: 28/i));
    fireKeyPressEvents('E');
    modal.getByText(hasTextAcrossElements(/characters remaining: 27/i));

    userEvent.click(modal.getByText('Accept'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      { id: 'write-in-lizardPeople', isWriteIn: true, name: 'LIZARD PEOPLE' },
    ]);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  test('displays warning when deselecting a write-in candidate', () => {
    const updateVote = jest.fn();
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

    const updateVote = jest.fn();
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

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  test('displays a warning when attempting to add more write-in candidates than seats', () => {
    const updateVote = jest.fn();
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
    userEvent.click(modal.getByText('Okay'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('prevents writing more than the allowed number of characters', () => {
    const { checkIsKeyDisabled, fireKeyPressEvents } =
      setUpMockVirtualKeyboard();

    const updateVote = jest.fn();
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

    expect(checkIsKeyDisabled(' ')).toEqual(true);
    userEvent.click(modal.getByText('Accept'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      {
        id: 'write-in-jacobJohansonJingleheimmerSchmidttT',
        isWriteIn: true,
        name: 'JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, T',
      },
    ]);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});

describe('audio cues', () => {
  test('updates the screen reader text to indicate selection state', () => {
    const updateVote = jest.fn();
    const { rerender } = render(
      <CandidateContest
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    const candidate = candidateContest.candidates[0];
    const firstCandidateChoice = screen
      .getByText(candidate.name)
      .closest('button')!;

    // initially, the candidate is not selected
    expect(firstCandidateChoice).toHaveAccessibleName(
      expect.stringContaining(candidate.name)
    );

    // select the candidate and manually update the vote
    userEvent.click(firstCandidateChoice);
    rerender(
      <CandidateContest
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[candidate]}
        updateVote={updateVote}
      />
    );

    // the candidate is now selected
    screen.getByRole('option', {
      name: new RegExp(`Selected.+${candidate.name}.+votes remaining.+0`, 'i'),
      selected: true,
    });

    //
    // Expect the "votes remaining" suffix to get cleared after a moment:
    //

    advanceTimers(1);

    const lastCandidateParty = getCandidateParties(
      electionDefinition.election.parties,
      candidate
    ).slice(-1)[0];

    screen.getByRole('option', {
      name: new RegExp(
        `^Selected.+${candidate.name}.+${lastCandidateParty.name}$`,
        'i'
      ),
      selected: true,
    });

    // deselect the candidate and manually update the vote
    userEvent.click(firstCandidateChoice);
    rerender(
      <CandidateContest
        election={electionDefinition.election}
        contest={candidateContest}
        vote={[]}
        updateVote={updateVote}
      />
    );

    // the candidate is no longer selected
    screen.getByRole('option', {
      name: new RegExp(
        `Deselected.+${candidate.name}.+votes remaining.+1`,
        'i'
      ),
      selected: false,
    });

    //
    // Expect the "deselected" audio prefix and "votes remaining" suffix to get
    // cleared after a moment:
    //

    advanceTimers(1);

    screen.getByRole('option', {
      name: new RegExp(`^${candidate.name}.+${lastCandidateParty.name}$`, 'i'),
      selected: false,
    });
  });
});
