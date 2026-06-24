import { expect, test, vi } from 'vitest';
import { pollingPlaceTypeName } from '@votingworks/types/src';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { LocationCvrsPanel } from './location_cvrs_panel';

test('renders nothing when not open', () => {
  const { container } = render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[]}
      name="Vx City"
      open={false}
      type="absentee"
    />
  );

  expect(container).toHaveTextContent('');
});

test('renders empty state note when open with no imports available', () => {
  render(
    <LocationCvrsPanel
      closePanel={vi.fn()}
      imports={[]}
      name="Vx City"
      open
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
          scannerIds: ['SCAN-01-0001'],
        },
        {
          id: 'two',
          exportTimestamp: '2020-11-07T09:00:00',
          numCvrsImported: 943,
          scannerIds: ['SCAN-01-0001', 'SCAN-01-0002'],
        },
      ]}
      name="Vx City"
      open
      type="absentee"
    />
  );

  screen.getButton('Close Panel');
  screen.getByText(pollingPlaceTypeName('absentee'));
  screen.getByText('Vx City');

  screen.queryByRole('listitem', {
    name: ['2020/11/07, 8:00AM', 'Scanner SCAN-01-0001', '412'].join(' '),
  });
  screen.queryByRole('listitem', {
    name: [
      '2020/11/07, 9:00AM',
      'Scanners:',
      'SCAN-01-0001',
      'SCAN-01-0002',
      '412',
    ].join(' '),
  });

  expect(screen.queryByText('No CVRs')).not.toBeInTheDocument();
});

test('emits close event when on close button press', () => {
  const close = vi.fn();

  render(
    <LocationCvrsPanel
      closePanel={close}
      imports={[]}
      name="Vx City"
      open
      type="absentee"
    />
  );

  expect(close).not.toHaveBeenCalled();
  userEvent.click(screen.getButton('Close Panel'));
  expect(close).toHaveBeenCalledOnce();
});
