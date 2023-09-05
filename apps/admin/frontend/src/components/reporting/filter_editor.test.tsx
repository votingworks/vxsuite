import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { FilterEditor } from './filter_editor';
import { screen, within } from '../../../test/react_testing_library';

test('FilterEditor', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const onChange = jest.fn();

  renderInAppContext(<FilterEditor election={election} onChange={onChange} />);

  // Add filter row, precinct
  userEvent.click(screen.getByText('Add Filter'));
  expect(onChange).not.toHaveBeenCalled();
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  userEvent.click(screen.getByText('Precinct'));
  expect(onChange).toHaveBeenNthCalledWith(1, { precinctIds: [] });
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(screen.getByText('Precinct 1'));
  expect(onChange).toHaveBeenNthCalledWith(2, { precinctIds: ['precinct-1'] });

  // Edit selections in filter row
  userEvent.click(screen.getByLabelText('Select Filter Values'));
  userEvent.click(screen.getByText('Precinct 2'));
  expect(onChange).toHaveBeenNthCalledWith(3, {
    precinctIds: ['precinct-1', 'precinct-2'],
  });
  userEvent.click(screen.getByLabelText('Remove Precinct 1'));
  expect(onChange).toHaveBeenNthCalledWith(4, {
    precinctIds: ['precinct-2'],
  });

  // Add another filter row, voting method
  userEvent.click(screen.getByText('Add Filter'));
  userEvent.click(screen.getByLabelText('Select New Filter Type'));
  userEvent.click(screen.getByText('Voting Method'));
  expect(onChange).toHaveBeenNthCalledWith(5, {
    precinctIds: ['precinct-2'],
    votingMethods: [],
  });
  userEvent.click(
    within(
      screen.getByTestId('filter-editor-row-voting-method')
    ).getByLabelText('Select Filter Values')
  );
  userEvent.click(screen.getByText('Absentee'));
  expect(onChange).toHaveBeenNthCalledWith(6, {
    precinctIds: ['precinct-2'],
    votingMethods: ['absentee'],
  });

  // Edit type of existing filter row, ballot style
  userEvent.click(
    within(
      screen.getByTestId('filter-editor-row-voting-method')
    ).getByLabelText('Edit Filter Type')
  );
  userEvent.click(screen.getByText('Ballot Style'));
  expect(onChange).toHaveBeenNthCalledWith(7, {
    precinctIds: ['precinct-2'],
    ballotStyleIds: [],
  });
  userEvent.click(
    within(screen.getByTestId('filter-editor-row-ballot-style')).getByLabelText(
      'Select Filter Values'
    )
  );
  screen.getByText('1M');
  screen.getByText('2F');

  // Remove filter row
  userEvent.click(
    within(screen.getByTestId('filter-editor-row-precinct')).getByLabelText(
      'Remove Filter'
    )
  );
  expect(onChange).toHaveBeenNthCalledWith(8, {
    ballotStyleIds: [],
  });
});

test('FilterEditor - cancel adding filter', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;
  const onChange = jest.fn();

  renderInAppContext(<FilterEditor election={election} onChange={onChange} />);

  userEvent.click(screen.getByText('Add Filter'));
  userEvent.click(screen.getByLabelText('Cancel Add Filter'));
  screen.getByText('Add Filter');
  expect(onChange).not.toHaveBeenCalled();
});
