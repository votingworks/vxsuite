import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { render, screen } from '../../test/react_testing_library';
import { MarkScanControllerSection } from './mark_scan_controller_section';

describe('input detection', () => {
  test('when detected', async () => {
    render(<MarkScanControllerSection isAccessibleControllerInputDetected />);
    await expectTextWithIcon('Detected', 'square-check');
  });

  test('when not detected', async () => {
    render(
      <MarkScanControllerSection isAccessibleControllerInputDetected={false} />
    );
    await expectTextWithIcon('Not detected', 'triangle-exclamation');
  });
});

describe('most recent diagnostic', () => {
  test('when no test on record', async () => {
    render(<MarkScanControllerSection isAccessibleControllerInputDetected />);
    await expectTextWithIcon('No test on record', 'circle-info');
  });

  const timestamp = new Date('2021-01-01T00:00:00').getTime();
  test('when test failed', async () => {
    render(
      <MarkScanControllerSection
        isAccessibleControllerInputDetected
        mostRecentAccessibleControllerDiagnostic={{
          type: 'mark-scan-accessible-controller',
          outcome: 'fail',
          message: 'up button not working.',
          timestamp,
        }}
      />
    );
    await expectTextWithIcon(
      'Test failed, 1/1/2021, 12:00:00 AM — up button not working.',
      'triangle-exclamation'
    );
  });

  test('when test failed, no failure message', async () => {
    render(
      <MarkScanControllerSection
        isAccessibleControllerInputDetected
        mostRecentAccessibleControllerDiagnostic={{
          type: 'mark-scan-accessible-controller',
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
      <MarkScanControllerSection
        isAccessibleControllerInputDetected
        mostRecentAccessibleControllerDiagnostic={{
          type: 'mark-scan-accessible-controller',
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
    <MarkScanControllerSection
      isAccessibleControllerInputDetected
      accessibleControllerSectionChildren={<p>Test Accessible Controller</p>}
    />
  );
  screen.getByText('Test Accessible Controller');
});
