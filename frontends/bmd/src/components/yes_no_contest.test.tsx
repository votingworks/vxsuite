import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  DistrictIdSchema,
  unsafeParse,
  YesNoContest as YesNoContestInterface,
} from '@votingworks/types';

import { YesNoContest } from './yes_no_contest';

const contest: YesNoContestInterface = {
  description:
    'Institute a garbage collection program that collects garbage on weekdays across the county.',
  districtId: unsafeParse(DistrictIdSchema, 'district-id'),
  id: 'contest-id',
  section: 'County',
  shortTitle: 'Prop 1',
  title: 'Prop 1: Garbage Collection Program',
  type: 'yesno',
};

describe('supports yes/no contest', () => {
  it('allows voting for both yes and no', () => {
    const updateVote = jest.fn();
    const { container } = render(
      <YesNoContest
        contest={contest}
        vote={undefined}
        updateVote={updateVote}
      />
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
    const { container } = render(
      <YesNoContest contest={contest} vote={['yes']} updateVote={updateVote} />
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
