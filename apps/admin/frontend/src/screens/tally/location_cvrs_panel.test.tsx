import { expect, test, vi } from 'vitest';
import { pollingPlaceTypeName } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library.js';
import { LocationCvrsPanel } from './location_cvrs_panel.js';

test('renders empty state note when open with no imports available', () => {
  render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[]}
      name="Vx City"
      type="absentee"
    />
  );

  screen.getButton('Close Panel');
  screen.getByText(pollingPlaceTypeName('absentee'));
  screen.getByText('Vx City');
  screen.getByText('No CVRs');

  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

test('renders import details when non-empty', () => {
  render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[
        {
          id: 'one',
          exportTimestamp: '2020-11-07T08:00:00',
          numCvrsImported: 412,
          filename: 'export',
          source: 'usb' as const,
          scannerIds: ['SCAN-01-0001'],
        },
        {
          id: 'two',
          exportTimestamp: '2020-11-07T09:00:00',
          numCvrsImported: 943,
          filename: 'export',
          source: 'usb' as const,
          scannerIds: ['SCAN-01-0001', 'SCAN-01-0002'],
        },
      ]}
      name="Vx City"
      type="absentee"
    />
  );

  screen.getButton('Close Panel');
  screen.getByText(pollingPlaceTypeName('absentee'));
  screen.getByText('Vx City');

  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    ['11/7/2020, 8:00 AM', 'Scanner SCAN-01-0001 •  USB', '412'].join(''),
    [
      '11/7/2020, 9:00 AM',
      'Scanners: SCAN-01-0001, SCAN-01-0002 •  USB',
      '943',
    ].join(''),
  ]);

  expect(screen.queryByText('No CVRs')).not.toBeInTheDocument();
});

test('emits close event when on close button press', () => {
  const close = vi.fn();

  render(
    <LocationCvrsPanel
      closePanel={close}
      imports={[]}
      name="Vx City"
      type="absentee"
    />
  );

  expect(close).not.toHaveBeenCalled();
  userEvent.click(screen.getButton('Close Panel'));
  expect(close).toHaveBeenCalledOnce();
});
