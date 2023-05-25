import React from 'react';
import { YesNoContest as YesNoContestInterface } from '@votingworks/types';

import {
  electionMinimalExhaustiveSample,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, within } from '../../test/react_testing_library';
import { render as renderWithBallotContext } from '../../test/test_utils';
import { YesNoContest } from './yes_no_contest';
import { ApiClientContext, createQueryClient } from '../api';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

const contest = electionMinimalExhaustiveSample.contests.find(
  (c) => c.id === 'fishing' && c.type === 'yesno'
) as YesNoContestInterface;

function renderComponent(
  children: Parameters<typeof renderWithBallotContext>[0],
  renderOptions: Parameters<typeof renderWithBallotContext>[1] = {}
) {
  apiMock.expectGetElectionDefinition(
    renderOptions.electionDefinition ??
      electionMinimalExhaustiveSampleDefinition
  );
  return renderWithBallotContext(
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider client={createQueryClient()}>
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>,
    renderOptions
  );
}

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

describe('supports yes/no contest', () => {
  it('allows voting for both yes and no', async () => {
    const updateVote = jest.fn();
    const { container } = renderComponent(
      <YesNoContest
        contest={contest}
        vote={undefined}
        updateVote={updateVote}
      />,
      {
        electionDefinition: electionMinimalExhaustiveSampleDefinition,
      }
    );

    const contestChoices = await screen.findByTestId('contest-choices');
    expect(container).toMatchSnapshot();

    fireEvent.click(
      (await within(contestChoices).findByText('Yes')).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(
      (await within(contestChoices).findByText('No')).closest('button')!
    );
    expect(updateVote).toHaveBeenCalledTimes(2);
  });

  it('displays warning when attempting to change vote', async () => {
    const updateVote = jest.fn();
    const { container } = renderComponent(
      <YesNoContest contest={contest} vote={['yes']} updateVote={updateVote} />,
      {
        electionDefinition: electionMinimalExhaustiveSampleDefinition,
      }
    );

    const contestChoices = await screen.findByTestId('contest-choices');
    expect(container).toMatchSnapshot();

    fireEvent.click(within(contestChoices).getByText('No').closest('button')!);
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.textContent ===
          'Do you want to change your vote to No? To change your vote, first unselect your vote for Yes.'
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Okay'));
  });
});
