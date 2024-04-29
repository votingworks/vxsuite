import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { render, screen } from '../../test/react_testing_library';
import { MarkScanPaperHandlerSection } from './mark_scan_paper_handler_section';

describe('input detection', () => {
  test('when detected', async () => {
    render(<MarkScanPaperHandlerSection isPaperHandlerDetected />);

    await expectTextWithIcon('Detected', 'square-check');
  });

  test('when not detected', async () => {
    render(<MarkScanPaperHandlerSection isPaperHandlerDetected={false} />);
    await expectTextWithIcon('Not detected', 'triangle-exclamation');
  });
});

describe('most recent diagnostic', () => {
  test('when no test on record', async () => {
    render(<MarkScanPaperHandlerSection isPaperHandlerDetected />);
    await expectTextWithIcon('No test on record', 'circle-info');
  });

  const timestamp = new Date('2021-01-01T00:00:00').getTime();

  test('when test failed', async () => {
    render(
      <MarkScanPaperHandlerSection
        isPaperHandlerDetected
        mostRecentPaperHandlerDiagnostic={{
          type: 'mark-scan-paper-handler',
          outcome: 'fail',
          message: 'Test Message',
          timestamp,
        }}
      />
    );
    await expectTextWithIcon(
      'Test failed, 1/1/2021, 12:00:00 AM — Test Message',
      'triangle-exclamation'
    );
  });

  test('when test failed, no failure message', async () => {
    render(
      <MarkScanPaperHandlerSection
        isPaperHandlerDetected
        mostRecentPaperHandlerDiagnostic={{
          type: 'mark-scan-paper-handler',
          outcome: 'fail',
          timestamp,
        }}
      />
    );
    await expectTextWithIcon(
      'Test failed, 1/1/2021, 12:00:00 AM',
      'triangle-exclamation'
    );
  });

  test('when test passed', async () => {
    render(
      <MarkScanPaperHandlerSection
        isPaperHandlerDetected
        mostRecentPaperHandlerDiagnostic={{
          type: 'mark-scan-paper-handler',
          outcome: 'pass',
          timestamp,
        }}
      />
    );
    await expectTextWithIcon(
      'Test passed, 1/1/2021, 12:00:00 AM',
      'square-check'
    );
  });
});

test('children', () => {
  render(
    <MarkScanPaperHandlerSection
      isPaperHandlerDetected
      paperHandlerSectionChildren={<p>Test Printer/Scanner</p>}
    />
  );
  screen.getByText('Test Printer/Scanner');
});
