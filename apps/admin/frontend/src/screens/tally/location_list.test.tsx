import { expect, test } from 'vitest';

import { PollingPlace } from '@votingworks/types';
import { CastVoteRecordFileRecord } from '@votingworks/admin-backend';
import userEvent from '@testing-library/user-event';

import { render, screen } from '../../../test/react_testing_library.js';
import { LocationList } from './location_list.js';
import { LocationCvrs } from './cvrs_state.js';
import { LocationCvrImport } from './location_cvrs_panel.js';

const place1 = mockPlace({ id: 'place1', name: 'Place 1', type: 'absentee' });
const place2 = mockPlace({ id: 'place2', name: 'Place 2', type: 'absentee' });

const locationCvrs1: LocationCvrs = {
  cvrCount: 500,
  files: [
    mockImport({
      id: 'one',
      exportTimestamp: '2020-11-07T08:00:00',
      numCvrsImported: 100,
      filename: 'export',
      source: 'usb' as const,
      scannerIds: ['SCAN-0001'],
    }),
    mockImport({
      id: 'two',
      exportTimestamp: '2020-11-07T09:00:00',
      numCvrsImported: 400,
      filename: 'export',
      source: 'usb' as const,
      scannerIds: ['SCAN-0001', 'SCAN-0002'],
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
    ['11/7/2020, 8:00 AM', 'Scanner SCAN-0001 •  USB', '100'].join(''),
    ['11/7/2020, 9:00 AM', 'Scanners: SCAN-0001, SCAN-0002 •  USB', '400'].join(
      ''
    ),
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
