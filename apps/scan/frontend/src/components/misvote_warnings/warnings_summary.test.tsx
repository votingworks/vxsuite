import { render, screen } from '../../../test/react_testing_library';
import { generateContests } from './test_utils.test';
import { WarningsSummary } from './warnings_summary';

test('renders all relevant warnings', () => {
  render(
    <WarningsSummary
      blankContests={generateContests(3)}
      overvoteContests={generateContests(2)}
      partiallyVotedContests={generateContests(1)}
    />
  );

  const listItems = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(listItems).toEqual([
    expect.stringMatching(/no votes .+ 3 contests/i),
    expect.stringMatching(/you may add .+ 1 contest/i),
    expect.stringMatching(/too many votes .+ 2 contests/i),
  ]);
});

test('omits warnings with no contests listed', () => {
  render(
    <WarningsSummary
      blankContests={[]}
      overvoteContests={generateContests(2)}
      partiallyVotedContests={[]}
    />
  );

  const listItems = screen.getAllByRole('listitem').map((li) => li.textContent);
  expect(listItems).toEqual([
    expect.stringMatching(/too many votes .+ 2 contests/i),
  ]);
});
