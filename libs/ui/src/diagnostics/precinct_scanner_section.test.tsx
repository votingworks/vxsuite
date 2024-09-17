import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { render } from '../../test/react_testing_library';
import { PrecinctScannerSection } from './precinct_scanner_section';

test('State: no_paper', async () => {
  render(<PrecinctScannerSection scannerStatus={{ state: 'no_paper' }} />);
  await expectTextWithIcon('The scanner is connected.', 'square-check');
});

test('State: paused', async () => {
  render(<PrecinctScannerSection scannerStatus={{ state: 'paused' }} />);
  await expectTextWithIcon('The scanner is connected.', 'square-check');
});

test('State: disconnected', async () => {
  render(<PrecinctScannerSection scannerStatus={{ state: 'disconnected' }} />);
  await expectTextWithIcon(
    'The scanner is disconnected. Please contact support.',
    'triangle-exclamation'
  );
});

test('State: connecting', async () => {
  render(<PrecinctScannerSection scannerStatus={{ state: 'connecting' }} />);
  await expectTextWithIcon(
    'The scanner is disconnected. Please contact support.',
    'triangle-exclamation'
  );
});

test('State: unrecoverable_error', async () => {
  render(
    <PrecinctScannerSection scannerStatus={{ state: 'unrecoverable_error' }} />
  );
  await expectTextWithIcon(
    'The scanner has experienced an error. Please restart the machine.',
    'triangle-exclamation'
  );
});

test('no test scan on record', async () => {
  render(
    <PrecinctScannerSection
      scannerStatus={{ state: 'no_paper' }}
      mostRecentScannerDiagnostic={undefined}
    />
  );

  await expectTextWithIcon('No test scan on record', 'circle-info');
});

const timestamp = new Date('2024-01-01T00:00:00').getTime();

test('test scan failed', async () => {
  render(
    <PrecinctScannerSection
      scannerStatus={{ state: 'no_paper' }}
      mostRecentScannerDiagnostic={{
        type: 'blank-sheet-scan',
        outcome: 'fail',
        timestamp,
      }}
    />
  );

  await expectTextWithIcon(
    'Test scan failed, 1/1/2024, 12:00:00 AM',
    'triangle-exclamation'
  );
});

test('test scan successful', async () => {
  render(
    <PrecinctScannerSection
      scannerStatus={{ state: 'no_paper' }}
      mostRecentScannerDiagnostic={{
        type: 'blank-sheet-scan',
        outcome: 'pass',
        timestamp,
      }}
    />
  );

  await expectTextWithIcon(
    'Test scan successful, 1/1/2024, 12:00:00 AM',
    'square-check'
  );
});
