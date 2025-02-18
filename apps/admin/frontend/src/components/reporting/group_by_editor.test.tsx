import { expect, test, vi } from 'vitest';
import { Tabulation } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { GroupByEditor } from './group_by_editor';
import { screen } from '../../../test/react_testing_library';
import { renderInAppContext } from '../../../test/render_in_app_context';

test('GroupByEditor', () => {
  const setGroupBy = vi.fn();
  const setIncludeSheetCounts = vi.fn();
  const groupBy: Tabulation.GroupBy = {
    groupByPrecinct: true,
    groupByParty: true,
  };

  renderInAppContext(
    <GroupByEditor
      groupBy={groupBy}
      setGroupBy={setGroupBy}
      includeSheetCounts
      setIncludeSheetCounts={setIncludeSheetCounts}
      allowedOptions={[
        'groupByBallotStyle',
        'groupByBatch',
        'groupByParty',
        'groupByPrecinct',
        'groupByScanner',
        'groupByVotingMethod',
        'includeSheetCounts',
      ]}
    />
  );

  const items: Array<[label: string, checked: boolean]> = [
    ['Precinct', true],
    ['Voting Method', false],
    ['Ballot Style', false],
    ['Scanner', false],
    ['Batch', false],
    ['Party', true],
    ['Sheet', true],
  ];

  for (const [label, checked] of items) {
    const button = screen.getByRole('checkbox', {
      name: label,
      checked,
    });
    expect(button).toHaveTextContent(label);
  }

  userEvent.click(screen.getByText('Ballot Style'));
  expect(setGroupBy).toHaveBeenCalledWith({
    ...groupBy,
    groupByBallotStyle: true,
  });
  expect(setIncludeSheetCounts).toHaveBeenCalledWith(true);

  userEvent.click(screen.getByText('Sheet'));
  expect(setGroupBy).toHaveBeenCalledWith(groupBy);
  expect(setIncludeSheetCounts).toHaveBeenCalledWith(false);
});
