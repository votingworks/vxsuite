import { expect, test } from 'vitest';

import { PollingPlace } from '@votingworks/types/src';
import { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../../test/react_testing_library';
import { LocationList } from './location_list';
import { LocationCvrs } from './cvrs_state';
import { LocationCvrImport } from './location_cvrs_panel';

const place1 = mockPlace({ id: 'place1', name: 'Place 1', type: 'absentee' });
const place2 = mockPlace({ id: 'place2', name: 'Place 2', type: 'absentee' });

const locationCvrs1: LocationCvrs = {
  cvrCount: 500,
  files: [
    mockImport({
      id: 'one',
      exportTimestamp: '2020-11-07T08:00:00',
      numCvrsImported: 100,
      scannerIds: ['SCAN-0001'],
      source: 'usb',
      batchLabels: [],
    }),
    mockImport({
      id: 'two',
      exportTimestamp: '2020-11-07T09:00:00',
      numCvrsImported: 400,
      scannerIds: ['SCAN-0001', 'SCAN-0002'],
      source: 'network',
      batchLabels: [],
    }),
  ],
  scannerIds: new Set(['SCAN-0001', 'SCAN-0002']),
};

const locationCvrs2: LocationCvrs = {
  cvrCount: 0,
  files: [],
  scannerIds: new Set(),
};

const locationCvrsMap = new Map([
  [place1.id, locationCvrs1],
  [place2.id, locationCvrs2],
]);

test('renders given locations', () => {
  render(
    <LocationList locationCvrs={locationCvrsMap} locations={[place1, place2]} />
  );

  screen.getButton(/^Place 1.*2 files from 2 scanners.*500$/i);
  screen.getButton(/^Place 2.*no cvrs.*0$/i);
});

test('toggles location CVR details on click', () => {
  render(
    <LocationList locationCvrs={locationCvrsMap} locations={[place1, place2]} />
  );

  userEvent.click(screen.getButton(/place 1/i));
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Scanner SCAN-000111/7/2020, 8:00 AM •  USB100',
    '2 scanners11/7/2020, 9:00 AM •  Network400',
  ]);

  userEvent.click(screen.getButton(/Place 1/i));
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

test('closes location CVR details on close button', () => {
  render(
    <LocationList locationCvrs={locationCvrsMap} locations={[place1, place2]} />
  );

  userEvent.click(screen.getButton(/Place 2/i));
  screen.getByText(/No files/);

  userEvent.click(screen.getButton('Close Panel'));
  expect(screen.queryByText(/No files/)).not.toBeInTheDocument();
});

function mockPlace(partial: Partial<PollingPlace>): PollingPlace {
  return partial as PollingPlace;
}

type Import = CastVoteRecordFileRecord;

function mockImport(partial: LocationCvrImport): Import {
  return partial as Import;
}
