import { expect, test, vi } from 'vitest';
import { pollingPlaceTypeName } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library.js';
import { LocationStatusCard } from './location_status_card.js';

test('location with no imports', () => {
  render(
    <LocationStatusCard
      cvrCount={0}
      id="east"
      importCount={0}
      name="Vx East"
      onPress={vi.fn()}
      scannerIds={[]}
      selected={false}
      type="election_day"
    />
  );

  screen.getByText('Vx East');
  screen.getByText(new RegExp(pollingPlaceTypeName('election_day')));
  screen.getByText(/No CVRs loaded yet/i);
  screen.getByText('0');
});

test('location with single-scanner imports', () => {
  render(
    <LocationStatusCard
      cvrCount={432}
      id="west"
      importCount={1}
      name="Vx West"
      onPress={vi.fn()}
      scannerIds={['0001']}
      selected={false}
      type="absentee"
    />
  );

  screen.getByText('Vx West');
  screen.getByText(new RegExp(pollingPlaceTypeName('absentee')));
  screen.getByText(/1 file from Scanner 0001/i);
  screen.getByText('432');
});

test('location with multi-scanner imports', () => {
  render(
    <LocationStatusCard
      cvrCount={2048}
      id="north"
      importCount={4}
      name="Vx North"
      onPress={vi.fn()}
      scannerIds={['0001', '0002', '0003']}
      selected
      type="early_voting"
    />
  );

  screen.getByText('Vx North');
  screen.getByText(new RegExp(pollingPlaceTypeName('early_voting')));
  screen.getByText(/4 files from 3 scanners/i);
  screen.getByText('2,048');
});

test('emits onPress event on click', () => {
  const onPress = vi.fn();
  const id = 'south';

  render(
    <LocationStatusCard
      cvrCount={2048}
      id={id}
      importCount={4}
      name="Vx South"
      onPress={onPress}
      scannerIds={['0001', '0002', '0003']}
      selected={false}
      type="early_voting"
    />
  );

  expect(onPress).not.toHaveBeenCalled();
  userEvent.click(screen.getButton(/Vx South/));
  expect(onPress).toHaveBeenCalledExactlyOnceWith(id);
});
