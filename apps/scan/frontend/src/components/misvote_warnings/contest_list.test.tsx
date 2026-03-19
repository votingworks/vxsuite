import { expect, test } from 'vitest';
import { render, screen } from '../../../test/react_testing_library.js';
import { ContestList } from './contest_list.js';
import { generateContests } from './test_utils.test.js';

test('renders all provided info', () => {
  const contests = generateContests(4);

  render(
    <ContestList
      title="Too many votes:"
      helpNote="These votes won't count."
      contests={contests}
      maxColumns={2}
    />
  );

  screen.getByText('Too many votes:');
  screen.getByText("These votes won't count.");

  const listItems = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(listItems).toEqual(contests.map((c) => c.title));
});
