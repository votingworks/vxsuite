import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { fakeKiosk } from '@votingworks/test-utils';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ExportReportPdfButton } from './export_report_pdf_button';
import { screen } from '../../../test/react_testing_library';

afterEach(() => {
  delete window.kiosk;
});

test('disabled by disabled prop', () => {
  window.kiosk = fakeKiosk();

  expect(window.kiosk).toBeDefined();
  renderInAppContext(
    <ExportReportPdfButton
      electionDefinition={electionMinimalExhaustiveSampleDefinition}
      generateReportPdf={() => Promise.resolve(new Uint8Array())}
      defaultFilename="some-file"
      disabled
    />
  );

  expect(screen.getButton('Export Report PDF')).toBeDisabled();
});

test('disabled when window.kiosk is undefined', () => {
  renderInAppContext(
    <ExportReportPdfButton
      electionDefinition={electionMinimalExhaustiveSampleDefinition}
      generateReportPdf={() => Promise.resolve(new Uint8Array())}
      defaultFilename="some-file"
      disabled={false}
    />
  );

  expect(screen.getButton('Export Report PDF')).toBeDisabled();
});
