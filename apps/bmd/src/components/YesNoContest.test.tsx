import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ContestIdSchema,
  YesNoContest as YesNoContestInterface,
} from '@votingworks/types';

import YesNoContest from './YesNoContest';

const contest: YesNoContestInterface = {
  description:
    'Institute a garbage collection program that collects garbage on weekdays across the county.',
  districtId: 'district-id',
  id: ContestIdSchema.parse('contest-id'),
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

    fireEvent.click(screen.getByText('Yes').closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('No').closest('button')!);
    expect(updateVote).toHaveBeenCalledTimes(2);
  });

  it('displays warning when attempting to change vote', () => {
    const updateVote = jest.fn();
    const { container } = render(
      <YesNoContest contest={contest} vote={['yes']} updateVote={updateVote} />
    );
    expect(container).toMatchSnapshot();
    fireEvent.click(screen.getByText('No').closest('button')!);
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
