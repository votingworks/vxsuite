import { Tabulation } from '@votingworks/types';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupByEditor } from './group_by_editor';
import { screen } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';

test('GroupByEditor', () => {
  const setGroupBy = jest.fn();
  const groupBy: Tabulation.GroupBy = {
    groupByPrecinct: true,
  };

  renderInAppContext(
    <GroupByEditor groupBy={groupBy} setGroupBy={setGroupBy} />
  );

  const items: Array<[label: string, checked: boolean]> = [
    ['Precinct', true],
    ['Voting Method', false],
    ['Ballot Style', false],
  ];

  for (const [label, checked] of items) {
    const item = screen.getByText(label).parentElement!;
    within(item).queryByRole('button', { pressed: checked });
  }

  const ballotStyleItem = screen.getByText('Ballot Style').parentElement!;
  userEvent.click(within(ballotStyleItem).getByRole('button'));
  expect(setGroupBy).toHaveBeenCalledWith({
    ...groupBy,
    groupByBallotStyle: true,
  });
});
