import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { LocationFilter, LocationFilterBar } from './location_filter_bar';

test('renders filter counts', () => {
  render(
    <LocationFilterBar
      filter="all"
      nLoaded={42}
      nLocations={78}
      query=""
      setFilter={vi.fn()}
      setQuery={vi.fn()}
    />
  );

  screen.getByRole('option', { name: 'All 78', selected: true });
  screen.getByRole('option', { name: 'Loaded 42' });
  screen.getByRole('option', { name: 'Pending 36' });
});

test('supports filter selection', () => {
  const setFilter = vi.fn();

  render(
    <LocationFilterBar
      filter="loaded"
      nLoaded={42}
      nLocations={78}
      query=""
      setFilter={setFilter}
      setQuery={vi.fn()}
    />
  );

  expect(setFilter).not.toHaveBeenCalled();

  screen.getByRole('option', { name: 'Loaded 42', selected: true });
  userEvent.click(
    screen.getByRole('option', { name: 'All 78', selected: false })
  );

  expect(setFilter).toHaveBeenCalledExactlyOnceWith<[LocationFilter]>('all');
});

test('renders current search query', () => {
  const setQuery = vi.fn();

  render(
    <LocationFilterBar
      filter="loaded"
      nLoaded={42}
      nLocations={78}
      query="Vx Cit"
      setFilter={vi.fn()}
      setQuery={setQuery}
    />
  );

  const input = screen.getByDisplayValue('Vx Cit');
  expect(setQuery).not.toHaveBeenCalled();

  userEvent.type(input, 'y');
  expect(setQuery).toHaveBeenCalledExactlyOnceWith('Vx City');
});

test('clears search query on escape key', () => {
  const setQuery = vi.fn();

  render(
    <LocationFilterBar
      filter="loaded"
      nLoaded={42}
      nLocations={78}
      query="Vx Cit"
      setFilter={vi.fn()}
      setQuery={setQuery}
    />
  );

  const input = screen.getByDisplayValue('Vx Cit');
  expect(setQuery).not.toHaveBeenCalled();

  userEvent.type(input, '{Escape}');
  expect(setQuery).toHaveBeenCalledExactlyOnceWith('');
});

test('clears search query on X button click', () => {
  const setQuery = vi.fn();

  render(
    <LocationFilterBar
      filter="loaded"
      nLoaded={42}
      nLocations={78}
      query="Vx Cit"
      setFilter={vi.fn()}
      setQuery={setQuery}
    />
  );

  const clear = screen.getButton('Clear Search Query');
  expect(setQuery).not.toHaveBeenCalled();

  userEvent.click(clear);
  expect(setQuery).toHaveBeenCalledExactlyOnceWith('');
});
