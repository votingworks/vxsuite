import { Tabulation } from '@votingworks/types';
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
    ['Scanner', false],
    ['Batch', false],
  ];

  for (const [label, checked] of items) {
    const button = screen.getByRole('button', {
      name: `Report By ${label}`,
      pressed: checked,
    });
    expect(button).toHaveTextContent(label);
  }

  userEvent.click(screen.getByText('Ballot Style'));
  expect(setGroupBy).toHaveBeenCalledWith({
    ...groupBy,
    groupByBallotStyle: true,
  });
});
