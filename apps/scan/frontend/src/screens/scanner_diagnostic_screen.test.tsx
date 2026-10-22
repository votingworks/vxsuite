import { test, expect, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library.js';
import { ScannerDiagnosticScreen } from './scanner_diagnostic_screen.js';

test('scanner diagnostic prompt - insert blank sheet', () => {
  render(
    <ScannerDiagnosticScreen
      scannerStatus={{
        state: 'scanner_diagnostic.running',
        ballotsCounted: 0,
        lifetimeSheetsCounted: 0,
      }}
      onClose={vi.fn()}
    />
  );
  screen.getByRole('heading', { name: 'Scanner Diagnostic' });
  screen.getByRole('heading', { name: 'Insert Blank Sheet' });
  screen.getByText('Insert a blank sheet into the scanner.');
});

test('scanner diagnostic done - test scan successful', async () => {
  const onClose = vi.fn();
  render(
    <ScannerDiagnosticScreen
      scannerStatus={{
        state: 'scanner_diagnostic.done',
        ballotsCounted: 0,
        lifetimeSheetsCounted: 0,
      }}
      onClose={onClose}
    />
  );

  screen.getByRole('heading', { name: 'Scanner Diagnostic' });
  screen.getByRole('heading', { name: 'Test Scan Successful' });
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});

test('scanner diagnostic done - test scan failed', async () => {
  const onClose = vi.fn();
  render(
    <ScannerDiagnosticScreen
      scannerStatus={{
        state: 'scanner_diagnostic.done',
        ballotsCounted: 0,
        lifetimeSheetsCounted: 0,
        error: 'scanner_diagnostic_failed',
      }}
      onClose={onClose}
    />
  );

  screen.getByRole('heading', { name: 'Scanner Diagnostic' });
  screen.getByRole('heading', { name: 'Test Scan Failed' });
  screen.getByText(
    'The test scan was not blank. Make sure you used a blank sheet. The scanner may need to be cleaned.'
  );
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalled();
});
