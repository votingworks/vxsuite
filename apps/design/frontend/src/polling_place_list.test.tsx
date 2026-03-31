import { describe, expect, test, vi } from 'vitest';

import { PollingPlace } from '@votingworks/types';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../test/react_testing_library';
import { PollingPlaceList } from './polling_place_list';

const withNoPrecincts: PollingPlace = {
  id: 'withNoPrecincts',
  name: 'Polling Place With No Precincts',
  precincts: {},
  type: 'absentee',
};

const with1Precinct: PollingPlace = {
  id: 'with1Precinct',
  name: 'Polling Place With One Precinct',
  precincts: { precinct1: { type: 'whole' } },
  type: 'early_voting',
};

const with3Precincts: PollingPlace = {
  id: 'with3Precincts',
  name: 'Polling Place With Three Precincts',
  precincts: {
    precinct1: { type: 'whole' },
    precinct2: { type: 'whole' },
    precinct3: { type: 'whole' },
  },
  type: 'election_day',
};

test('renders callout when empty', async () => {
  render(<PollingPlaceList onSelect={vi.fn()} places={[]} />);

  await screen.findByText(/you haven't added any polling places/i);
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
});

test('renders sublist headings, place names, and precinct counts', async () => {
  render(
    <PollingPlaceList
      onSelect={vi.fn()}
      places={[with3Precincts, with1Precinct, withNoPrecincts]}
    />
  );

  const listboxChildren = (await screen.findByRole('listbox')).children;
  expect([...listboxChildren].map((el) => el.textContent)).toEqual([
    'Absentee Voting',
    getOption(withNoPrecincts, '0 Precincts').textContent,

    'Early Voting',
    getOption(with1Precinct, '1 Precinct').textContent,

    'Election Day',
    getOption(with3Precincts, '3 Precincts').textContent,
  ]);
});

describe('auto-selects first place in the list if none selected', () => {
  for (const spec of [
    {
      title: 'with all polling place types present',
      places: [with3Precincts, with1Precinct, withNoPrecincts],
      expectedSelection: withNoPrecincts, // Absentee takes precedence
    },
    {
      title: 'with early voting and election day polling places',
      places: [with3Precincts, with1Precinct],
      expectedSelection: with1Precinct, // Early voting
    },
    {
      title: 'with only election day polling places',
      places: [with3Precincts],
      expectedSelection: with3Precincts,
    },
  ]) {
    test(`${spec.title}`, async () => {
      const onSelect = vi.fn();
      render(<PollingPlaceList onSelect={onSelect} places={spec.places} />);

      await screen.findAllByRole('option');
      expect(onSelect).toHaveBeenCalledWith(spec.expectedSelection.id);
    });
  }
});

test('renders selected pollingPlace, emits event on select', async () => {
  const mockOnSelect = vi.fn();
  render(
    <PollingPlaceList
      onSelect={mockOnSelect}
      places={[withNoPrecincts, with1Precinct, with3Precincts]}
      selectedId={with1Precinct.id}
    />
  );

  const listItems = await screen.findAllByRole('option');
  expect(listItems).toEqual([
    getOption(withNoPrecincts, '0 Precincts'),
    getOption(with1Precinct, '1 Precinct', { selected: true }),
    getOption(with3Precincts, '3 Precincts'),
  ]);

  expect(mockOnSelect).not.toHaveBeenCalled();

  userEvent.click(
    getOption(with3Precincts, '3 Precincts', { selected: false })
  );
  expect(mockOnSelect).toHaveBeenCalledWith(with3Precincts.id);
});

function getOption(
  pollingPlace: PollingPlace,
  caption: string,
  opts: { selected?: boolean } = {}
) {
  return screen.getByRole('option', {
    ...opts,
    name: [pollingPlace.name, caption].join(' '),
  });
}
