import { expect, test } from 'vitest';
import type {
  IppPrinterState,
  PrinterConfig,
  PrinterStatus,
} from '@votingworks/types';
import { render, screen } from '../test/react_testing_library.js';
import { userEvent } from './user_event.js';
import { PrinterAlert } from './printer_alert.js';

const MOCK_PRINTER_CONFIG: PrinterConfig = {
  label: '',
  vendorId: 0,
  productId: 0,
  baseDeviceUri: '',
  ppd: '',
  supportsIpp: true,
};

const NO_PAPER_MESSAGE =
  'The printer does not detect any paper. Either the paper tray is open or the printer is out of paper.';
const COVER_OPEN_MESSAGE =
  "The printer's cover is open. Close the printer's cover.";

function printerStatus(
  stateReasons: string[],
  state: IppPrinterState = 'stopped'
): PrinterStatus {
  return {
    connected: true,
    config: MOCK_PRINTER_CONFIG,
    richStatus: { state, stateReasons, markerInfos: [] },
  };
}

function queryAlert() {
  return screen.queryByRole('heading', { name: 'Printer Alert' });
}

test('shows nothing without a blocking reason or a stopped printer', () => {
  const { rerender } = render(<PrinterAlert />);
  expect(queryAlert()).toBeNull();

  rerender(<PrinterAlert printerStatus={{ connected: false }} />);
  expect(queryAlert()).toBeNull();

  rerender(
    <PrinterAlert
      printerStatus={{ connected: true, config: MOCK_PRINTER_CONFIG }}
    />
  );
  expect(queryAlert()).toBeNull();

  rerender(
    <PrinterAlert
      printerStatus={printerStatus(['toner-low-warning'], 'idle')}
    />
  );
  expect(queryAlert()).toBeNull();
});

test('shows a blocking reason even when the printer is not stopped', () => {
  render(
    <PrinterAlert
      printerStatus={printerStatus(['media-empty-report'], 'idle')}
    />
  );
  screen.getByRole('heading', { name: 'Printer Alert' });
  screen.getByText(NO_PAPER_MESSAGE);
});

test('prefers the blocking reason over a higher-priority stopped reason', () => {
  render(
    <PrinterAlert
      printerStatus={printerStatus(['paused-error', 'cover-open-report'])}
    />
  );
  screen.getByText(COVER_OPEN_MESSAGE);
});

test('ignores a stopped printer with no specific reason', () => {
  render(<PrinterAlert printerStatus={printerStatus(['other-error'])} />);
  expect(queryAlert()).toBeNull();
});

test('shows the highest priority reason when the printer is stopped', () => {
  render(
    <PrinterAlert
      printerStatus={printerStatus(['toner-low-warning', 'media-empty-error'])}
    />
  );
  screen.getByRole('heading', { name: 'Printer Alert' });
  screen.getByText(NO_PAPER_MESSAGE);
});

test('stays dismissed while polling returns new objects with the same reason', () => {
  const { rerender } = render(
    <PrinterAlert printerStatus={printerStatus(['media-empty-error'])} />
  );
  userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(queryAlert()).toBeNull();

  rerender(
    <PrinterAlert printerStatus={printerStatus(['media-empty-error'])} />
  );
  expect(queryAlert()).toBeNull();
});

test('shows again when the reason changes after dismissal', () => {
  const { rerender } = render(
    <PrinterAlert printerStatus={printerStatus(['media-empty-error'])} />
  );
  userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

  rerender(
    <PrinterAlert printerStatus={printerStatus(['cover-open-error'])} />
  );
  screen.getByText(COVER_OPEN_MESSAGE);
});

test('shows a non-blocking reason when the printer is stopped', () => {
  render(<PrinterAlert printerStatus={printerStatus(['paused-error'])} />);
  screen.getByText('The printer is paused. Restart the printer.');
});

test('stays dismissed when a blocking reason escalates from report to error', () => {
  const { rerender } = render(
    <PrinterAlert
      printerStatus={printerStatus(['media-empty-report'], 'idle')}
    />
  );
  userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

  rerender(
    <PrinterAlert printerStatus={printerStatus(['media-empty-error'])} />
  );
  expect(queryAlert()).toBeNull();
});

test('shows the same reason again after the printer recovers', () => {
  const { rerender } = render(
    <PrinterAlert printerStatus={printerStatus(['media-empty-error'])} />
  );
  userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

  rerender(<PrinterAlert printerStatus={printerStatus([], 'idle')} />);
  expect(queryAlert()).toBeNull();

  rerender(
    <PrinterAlert printerStatus={printerStatus(['media-empty-error'])} />
  );
  screen.getByText(NO_PAPER_MESSAGE);
});
