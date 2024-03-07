import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { render } from '../../test/react_testing_library';
import { CentralScannerSection } from './central_scanner_section';

test('connected', async () => {
  render(<CentralScannerSection isScannerAttached />);

  await expectTextWithIcon('Connected', 'square-check');
});

test('not connected', async () => {
  render(<CentralScannerSection isScannerAttached={false} />);

  await expectTextWithIcon('No scanner detected', 'circle-info');
});

test('no test scan on record', async () => {
  render(
    <CentralScannerSection
      isScannerAttached
      mostRecentScannerDiagnostic={undefined}
    />
  );

  await expectTextWithIcon('No test scan on record', 'circle-info');
});

const timestamp = new Date('2024-01-01T00:00:00').getTime();

test('test scan failed', async () => {
  render(
    <CentralScannerSection
      isScannerAttached
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
    <CentralScannerSection
      isScannerAttached
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
