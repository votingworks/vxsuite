import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  CandidateContest as CandidateContestInterface,
  Parties,
} from '@votingworks/types';

import { act } from 'react-dom/test-utils';
import CandidateContest from './CandidateContest';

const parties: Parties = [0, 1].map((i) => ({
  abbrev: `${i}`,
  id: `party-${i}`,
  name: `Party ${i}`,
  fullName: `Party ${i}`,
}));

const contest: CandidateContestInterface = {
  allowWriteIns: false,
  candidates: [0, 1, 2].map((i) => ({
    id: `name-${i}`,
    name: `Name ${i}`,
    partyId: `party-${i % 2}`,
  })),
  districtId: '7',
  id: 'contest-id',
  seats: 1,
  section: 'City',
  title: 'Mayor',
  type: 'candidate',
};
const candidate0 = contest.candidates[0];
const candidate1 = contest.candidates[1];
const candidate2 = contest.candidates[2];

beforeEach(() => {
  jest.useFakeTimers();
});

describe('supports single-seat contest', () => {
  it('allows any candidate to be selected when no candidate is selected', () => {
    const updateVote = jest.fn();
    const { container } = render(
      <CandidateContest
        contest={contest}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
    );
    expect(container).toMatchSnapshot();

    fireEvent.click(screen.getByText(candidate0.name).closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(candidate1.name).closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText(candidate2.name).closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(3);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("doesn't allow other candidates to be selected when a candidate is selected", async () => {
    const updateVote = jest.fn();
    const { container } = render(
      <CandidateContest
        contest={contest}
        parties={parties}
        vote={[candidate0]}
        updateVote={updateVote}
      />
    );
    expect(container).toMatchSnapshot();

    expect(
      screen.getByText(candidate0.name).closest('button')!.dataset.selected
    ).toBe('true');

    fireEvent.click(screen.getByText(candidate1.name).closest('button')!);
    expect(updateVote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(candidate2.name).closest('button')!);
    expect(updateVote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(candidate0.name).closest('button')!);
    expect(updateVote).toHaveBeenCalled();

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});

describe('supports multi-seat contests', () => {
  it('allows a second candidate to be selected when one is selected', () => {
    const updateVote = jest.fn();
    const { container } = render(
      <CandidateContest
        contest={{ ...contest, seats: 2 }}
        parties={parties}
        vote={[candidate0]}
        updateVote={updateVote}
      />
    );
    expect(container).toMatchSnapshot();

    expect(
      screen.getByText(candidate0.name).closest('button')!.dataset.selected
    ).toBe('true');
    expect(
      screen.getByText(candidate1.name).closest('button')!.dataset.selected
    ).toBe('false');
    expect(
      screen.getByText(candidate2.name).closest('button')!.dataset.selected
    ).toBe('false');

    fireEvent.click(screen.getByText(candidate1.name).closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(candidate2.name).closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText(candidate0.name).closest('button')!);
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
    render(
      <CandidateContest
        contest={{ ...contest, allowWriteIns: true }}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
    );
    fireEvent.click(
      screen.getByText('add write-in candidate').closest('button')!
    );
    screen.getByText('Write-In Candidate');
    typeKeysInVirtualKeyboard('LIZARD PEOPLE');
    fireEvent.click(screen.getByText('Accept'));
    expect(screen.queryByText('Write-In Candidate')).toBeFalsy();

    expect(updateVote).toHaveBeenCalledWith(contest.id, [
      { id: 'write-in__lizardPeople', isWriteIn: true, name: 'LIZARD PEOPLE' },
    ]);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('displays warning if write-in candidate name is too long', () => {
    const updateVote = jest.fn();
    render(
      <CandidateContest
        contest={{ ...contest, allowWriteIns: true }}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
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
    render(
      <CandidateContest
        contest={{ ...contest, allowWriteIns: true }}
        parties={parties}
        vote={[]}
        updateVote={updateVote}
      />
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

    expect(updateVote).toHaveBeenCalledWith(contest.id, [
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
