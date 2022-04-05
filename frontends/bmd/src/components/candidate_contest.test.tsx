import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { CandidateContest as CandidateContestInterface } from '@votingworks/types';
import {
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';

import { act } from 'react-dom/test-utils';
import { render as renderWithBallotContext } from '../../test/test_utils';
import { CandidateContest } from './candidate_contest';

const electionDefinition = electionSampleDefinition;
const precinctId = electionDefinition.election.precincts[0].id;

const candidateContest = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate'
)! as CandidateContestInterface;

const candidateContestWithMultipleSeats = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate' && c.seats > 1
)! as CandidateContestInterface;

const candidateContestWithWriteIns = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate' && c.allowWriteIns
)! as CandidateContestInterface;

beforeEach(() => {
  jest.useFakeTimers();
});

describe('supports single-seat contest', () => {
  it('allows any candidate to be selected when no candidate is selected', () => {
    const updateVote = jest.fn();
    renderWithBallotContext(
      <CandidateContest
        contest={candidateContest}
        parties={electionSample.parties}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );

    fireEvent.click(
      screen.getByText(candidateContest.candidates[0]!.name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByText(candidateContest.candidates[1]!.name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByText(candidateContest.candidates[2]!.name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(3);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("doesn't allow other candidates to be selected when a candidate is selected", async () => {
    const updateVote = jest.fn();
    renderWithBallotContext(
      <CandidateContest
        contest={candidateContest}
        parties={electionSample.parties}
        vote={[candidateContest.candidates[0]]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );

    expect(
      screen.getByText(candidateContest.candidates[0].name).closest('button')!
        .dataset.selected
    ).toBe('true');

    fireEvent.click(
      screen.getByText(candidateContest.candidates[1].name).closest('button')!
    );
    expect(updateVote).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByText(candidateContest.candidates[2].name).closest('button')!
    );
    expect(updateVote).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByText(candidateContest.candidates[0].name).closest('button')!
    );
    expect(updateVote).toHaveBeenCalled();

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});

describe('supports multi-seat contests', () => {
  it('allows a second candidate to be selected when one is selected', () => {
    const updateVote = jest.fn();
    renderWithBallotContext(
      <CandidateContest
        contest={candidateContestWithMultipleSeats}
        parties={electionSample.parties}
        vote={[candidateContestWithMultipleSeats.candidates[0]]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );

    expect(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[0].name)
        .closest('button')!.dataset.selected
    ).toBe('true');
    expect(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[1].name)
        .closest('button')!.dataset.selected
    ).toBe('false');
    expect(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[2].name)
        .closest('button')!.dataset.selected
    ).toBe('false');

    fireEvent.click(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[1].name)
        .closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen
        .getByText(candidateContestWithMultipleSeats.candidates[2].name)
        .closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(2);

    fireEvent.click(
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
  function typeKeysInVirtualKeyboard(chars: string): void {
    for (const i of chars) {
      const key = i === ' ' ? 'space' : i;
      fireEvent.click(screen.getByText(key).closest('button')!);
    }
  }

  it('updates votes when a write-in candidate is selected', () => {
    const updateVote = jest.fn();
    renderWithBallotContext(
      <CandidateContest
        contest={candidateContestWithWriteIns}
        parties={electionSample.parties}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );
    fireEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );
    screen.getByText('Write-In Candidate');
    typeKeysInVirtualKeyboard('LIZARD PEOPLE');
    fireEvent.click(screen.getByText('Accept'));
    expect(screen.queryByText('Write-In Candidate')).toBeFalsy();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      { id: 'write-in__lizardPeople', isWriteIn: true, name: 'LIZARD PEOPLE' },
    ]);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('displays warning if write-in candidate name is too long', () => {
    const updateVote = jest.fn();
    renderWithBallotContext(
      <CandidateContest
        contest={candidateContestWithWriteIns}
        parties={electionSample.parties}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );
    fireEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );
    screen.getByText('Write-In Candidate');
    typeKeysInVirtualKeyboard('JACOB JOHANSON JINGLEHEIMMER SCHMIDTT');
    screen.getByText('You have entered 37 of maximum 40 characters.');
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Write-In Candidate')).toBeFalsy();

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('prevents writing more than the allowed number of characters', () => {
    const updateVote = jest.fn();
    renderWithBallotContext(
      <CandidateContest
        contest={candidateContestWithWriteIns}
        parties={electionSample.parties}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );
    fireEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );
    screen.getByText('Write-In Candidate');
    const writeInCandidate =
      "JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, THAT'S MY NAME TOO";
    typeKeysInVirtualKeyboard(writeInCandidate);
    screen.getByText('You have entered 40 of maximum 40 characters.');

    expect(
      screen.getByText('space').closest('button')!.hasAttribute('disabled')
    ).toBe(true);
    fireEvent.click(screen.getByText('Accept'));
    expect(screen.queryByText('Write-In Candidate')).toBeFalsy();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      {
        id: 'write-in__jacobJohansonJingleheimmerSchmidttT',
        isWriteIn: true,
        name: 'JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, T',
      },
    ]);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});
