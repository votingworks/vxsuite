import React from 'react';

import { CandidateContest as CandidateContestInterface } from '@votingworks/types';
import { electionSampleDefinition } from '@votingworks/fixtures';

import { act } from 'react-dom/test-utils';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, within } from '../../test/react_testing_library';
import { render as renderWithBallotContext } from '../../test/test_utils';
import { CandidateContest } from './candidate_contest';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ApiClientContext, createQueryClient } from '../api';

const electionDefinition = electionSampleDefinition;
const precinctId = electionDefinition.election.precincts[0].id;

const candidateContest = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate'
)! as CandidateContestInterface;

const candidateContestWithMultipleSeats =
  electionDefinition.election.contests.find(
    (c) => c.type === 'candidate' && c.seats > 1
  )! as CandidateContestInterface;

const candidateContestWithWriteIns = electionDefinition.election.contests.find(
  (c) => c.type === 'candidate' && c.allowWriteIns
)! as CandidateContestInterface;

let apiMock: ApiMock;

function renderScreen(
  children: Parameters<typeof renderWithBallotContext>[0],
  props: Parameters<typeof renderWithBallotContext>[1] = {}
) {
  apiMock.expectGetElectionDefinition(electionDefinition);
  return renderWithBallotContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>,
    props
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

describe('supports single-seat contest', () => {
  it('allows any candidate to be selected when no candidate is selected', async () => {
    const updateVote = jest.fn();
    renderScreen(
      <CandidateContest
        contest={candidateContest}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );

    fireEvent.click(
      (await screen.findByText(candidateContest.candidates[0]!.name)).closest(
        'button'
      )!
    );
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(
      (await screen.findByText(candidateContest.candidates[1]!.name)).closest(
        'button'
      )!
    );
    expect(updateVote).toHaveBeenCalledTimes(2);

    fireEvent.click(
      (await screen.findByText(candidateContest.candidates[2]!.name)).closest(
        'button'
      )!
    );
    expect(updateVote).toHaveBeenCalledTimes(3);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it("doesn't allow other candidates to be selected when a candidate is selected", async () => {
    const updateVote = jest.fn();
    renderScreen(
      <CandidateContest
        contest={candidateContest}
        vote={[candidateContest.candidates[0]]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );

    await screen.findByRole('option', {
      name: new RegExp(candidateContest.candidates[0].name),
      selected: true,
    });

    fireEvent.click(
      (await screen.findByText(candidateContest.candidates[1].name)).closest(
        'button'
      )!
    );
    expect(updateVote).not.toHaveBeenCalled();

    fireEvent.click(
      (await screen.findByText(candidateContest.candidates[2].name)).closest(
        'button'
      )!
    );
    expect(updateVote).not.toHaveBeenCalled();

    fireEvent.click(
      (await screen.findByText(candidateContest.candidates[0].name)).closest(
        'button'
      )!
    );
    expect(updateVote).toHaveBeenCalled();

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });
});

describe('supports multi-seat contests', () => {
  it('allows a second candidate to be selected when one is selected', async () => {
    const updateVote = jest.fn();
    renderScreen(
      <CandidateContest
        contest={candidateContestWithMultipleSeats}
        vote={[candidateContestWithMultipleSeats.candidates[0]]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );

    await screen.findByRole('option', {
      name: new RegExp(candidateContestWithMultipleSeats.candidates[0].name),
      selected: true,
    });
    await screen.findByRole('option', {
      name: new RegExp(candidateContestWithMultipleSeats.candidates[1].name),
      selected: false,
    });
    await screen.findByRole('option', {
      name: new RegExp(candidateContestWithMultipleSeats.candidates[2].name),
      selected: false,
    });

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
  async function typeKeysInVirtualKeyboard(chars: string): Promise<void> {
    for (const i of chars) {
      const key = i === ' ' ? 'space' : i;
      fireEvent.click((await screen.findByText(key)).closest('button')!);
    }
  }

  it('updates votes when a write-in candidate is selected', async () => {
    const updateVote = jest.fn();
    renderScreen(
      <CandidateContest
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );
    fireEvent.click(
      (await screen.findByText('add write-in candidate')).closest('button')!
    );

    const modal = within(await screen.findByRole('alertdialog'));

    modal.getByText(`Write-In: ${candidateContestWithWriteIns.title}`);
    modal.getByText(/40 characters remaining/);

    await typeKeysInVirtualKeyboard('LIZARD PEOPLE');

    modal.getByText(/27 characters remaining/);

    fireEvent.click(modal.getByText('Accept'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    expect(updateVote).toHaveBeenCalledWith(candidateContestWithWriteIns.id, [
      { id: 'write-in-lizardPeople', isWriteIn: true, name: 'LIZARD PEOPLE' },
    ]);

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('displays warning if write-in candidate name is too long', async () => {
    const updateVote = jest.fn();
    renderScreen(
      <CandidateContest
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );
    fireEvent.click(
      (await screen.findByText('add write-in candidate')).closest('button')!
    );

    const modal = within(await screen.findByRole('alertdialog'));

    modal.getByText(`Write-In: ${candidateContestWithWriteIns.title}`);
    await typeKeysInVirtualKeyboard('JACOB JOHANSON JINGLEHEIMMER SCHMIDTT');
    modal.getByText(/3 characters remaining/);
    fireEvent.click(modal.getByText('Cancel'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('prevents writing more than the allowed number of characters', async () => {
    const updateVote = jest.fn();
    renderScreen(
      <CandidateContest
        contest={candidateContestWithWriteIns}
        vote={[]}
        updateVote={updateVote}
      />,
      {
        electionDefinition,
        precinctId,
      }
    );
    fireEvent.click(
      (await screen.findByText('add write-in candidate')).closest('button')!
    );

    const modal = within(screen.getByRole('alertdialog'));

    modal.getByText(`Write-In: ${candidateContestWithWriteIns.title}`);
    const writeInCandidate =
      "JACOB JOHANSON JINGLEHEIMMER SCHMIDTT, THAT'S MY NAME TOO";
    await typeKeysInVirtualKeyboard(writeInCandidate);
    modal.getByText(/0 characters remaining/);

    expect(
      modal.getByText('space').closest('button')!.hasAttribute('disabled')
    ).toEqual(true);
    fireEvent.click(modal.getByText('Accept'));
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
