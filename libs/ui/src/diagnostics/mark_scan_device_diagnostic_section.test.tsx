import { expectTextWithIcon } from '../../test/expect_text_with_icon';
import { render, screen } from '../../test/react_testing_library';
import {
  MarkScanDeviceDiagnosticSection,
  MarkScanDeviceDiagnosticSectionProps,
} from './mark_scan_device_diagnostic_section';
import { DiagnosticSectionTitle } from './types';

function renderComponent(
  props: Partial<MarkScanDeviceDiagnosticSectionProps> = {}
) {
  const {
    isDeviceConnected = true,
    diagnosticType = 'mark-scan-accessible-controller',
    title = DiagnosticSectionTitle.AccessibleController,
    mostRecentDiagnosticRecord,
    children,
  } = props;

  render(
    <MarkScanDeviceDiagnosticSection
      isDeviceConnected={isDeviceConnected}
      diagnosticType={diagnosticType}
      title={title}
      mostRecentDiagnosticRecord={mostRecentDiagnosticRecord}
    >
      {children}
    </MarkScanDeviceDiagnosticSection>
  );
}

describe('input detection', () => {
  test('when detected', async () => {
    renderComponent();
    await expectTextWithIcon('Connected', 'square-check');
  });

  test('when not detected', async () => {
    renderComponent({ isDeviceConnected: false });
    await expectTextWithIcon('Not connected', 'triangle-exclamation');
  });
});

describe('most recent diagnostic', () => {
  test('when no test on record', async () => {
    renderComponent();
    await expectTextWithIcon('No test on record', 'circle-info');
  });

  const timestamp = new Date('2021-01-01T00:00:00').getTime();
  test('when test failed', async () => {
    renderComponent({
      diagnosticType: 'mark-scan-accessible-controller',
      mostRecentDiagnosticRecord: {
        type: 'mark-scan-accessible-controller',
        outcome: 'fail',
        message: 'up button not working.',
        timestamp,
      },
    });

    await expectTextWithIcon(
      'Test failed, 1/1/2021, 12:00:00 AM — up button not working.',
      'triangle-exclamation'
    );
  });

  test('when test failed, no failure message', async () => {
    renderComponent({
      diagnosticType: 'mark-scan-accessible-controller',
      mostRecentDiagnosticRecord: {
        type: 'mark-scan-accessible-controller',
        outcome: 'fail',
        timestamp,
      },
    });

    await expectTextWithIcon(
      'Test failed, 1/1/2021, 12:00:00 AM',
      'triangle-exclamation'
    );
  });

  test('when test passed', async () => {
    renderComponent({
      diagnosticType: 'mark-scan-accessible-controller',
      mostRecentDiagnosticRecord: {
        type: 'mark-scan-accessible-controller',
        outcome: 'pass',
        timestamp,
      },
    });

    await expectTextWithIcon(
      'Test passed, 1/1/2021, 12:00:00 AM',
      'square-check'
    );
  });
});

test('children', () => {
  renderComponent({ children: <p>Test Accessible Controller</p> });
  screen.getByText('Test Accessible Controller');
});
