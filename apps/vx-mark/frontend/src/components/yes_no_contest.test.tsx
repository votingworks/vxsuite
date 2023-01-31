import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { YesNoContest as YesNoContestInterface } from '@votingworks/types';

import {
  electionMinimalExhaustiveSample,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { render as renderWithBallotContext } from '../../test/test_utils';
import { YesNoContest } from './yes_no_contest';

const contest = electionMinimalExhaustiveSample.contests.find(
  (c) => c.id === 'fishing' && c.type === 'yesno'
) as YesNoContestInterface;

describe('supports yes/no contest', () => {
  it('allows voting for both yes and no', () => {
    const updateVote = jest.fn();
    const { container } = renderWithBallotContext(
      <YesNoContest
        contest={contest}
        vote={undefined}
        updateVote={updateVote}
      />,
      {
        electionDefinition: electionMinimalExhaustiveSampleDefinition,
      }
    );
    expect(container).toMatchSnapshot();

    const contestChoices = screen.getByTestId('contest-choices');
    fireEvent.click(within(contestChoices).getByText('Yes').closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(within(contestChoices).getByText('No').closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(2);
  });

  it('displays warning when attempting to change vote', () => {
    const updateVote = jest.fn();
    const { container } = renderWithBallotContext(
      <YesNoContest contest={contest} vote={['yes']} updateVote={updateVote} />,
      {
        electionDefinition: electionMinimalExhaustiveSampleDefinition,
      }
    );
    expect(container).toMatchSnapshot();
    const contestChoices = screen.getByTestId('contest-choices');
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
