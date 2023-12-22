import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import {
  expectPrint,
  fakeFileWriter,
  fakeKiosk,
} from '@votingworks/test-utils';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { screen, waitFor, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { FullTestDeckTallyReportButton } from './full_test_deck_tally_report_button';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  const mockKiosk = fakeKiosk();
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.writeFile = jest.fn().mockResolvedValue(fileWriter);
  window.kiosk = mockKiosk;
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('prints appropriate reports for primary election', async () => {
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionTwoPartyPrimaryDefinition,
    apiMock,
  });

  const fullTestDeckButton = screen.getButton(
    'Print Full Test Deck Tally Report'
  );
  await waitFor(() => {
    expect(fullTestDeckButton).toBeEnabled();
  });
  userEvent.click(fullTestDeckButton);

  await expectPrint((printedElement, printOptions) => {
    const reports = printedElement.getAllByTestId(/test-deck-tally-report/);
    const mammalReport = within(reports[0]);
    mammalReport.getByText(
      'Test Deck Mammal Party Example Primary Election Tally Report'
    );
    expect(mammalReport.getByTestId('total-ballot-count')).toHaveTextContent(
      '68'
    );

    const fishReport = within(reports[1]);
    fishReport.getByText(
      'Test Deck Fish Party Example Primary Election Tally Report'
    );
    expect(fishReport.getByTestId('total-ballot-count')).toHaveTextContent(
      '60'
    );

    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
});

test('prints appropriate report for general election', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    apiMock,
  });

  const fullTestDeckButton = screen.getButton(
    'Print Full Test Deck Tally Report'
  );
  await waitFor(() => {
    expect(fullTestDeckButton).toBeEnabled();
  });
  userEvent.click(fullTestDeckButton);

  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText(
      'Test Deck Lincoln Municipal General Election Tally Report'
    );
    expect(printedElement.getByTestId('total-ballot-count')).toHaveTextContent(
      '232'
    );

    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
});

test('renders SaveFileToUsb component for saving PDF', async () => {
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
    apiMock,
  });
  const fullTestDeckButton = screen.getButton(
    'Save Full Test Deck Tally Report as PDF'
  );
  await waitFor(() => {
    expect(fullTestDeckButton).toBeEnabled();
  });
  userEvent.click(fullTestDeckButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Test Deck Tally Report');
});

test('closes SaveFileToUsb modal', async () => {
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
    apiMock,
  });
  const fullTestDeckButton = screen.getButton(
    'Save Full Test Deck Tally Report as PDF'
  );
  await waitFor(() => {
    expect(fullTestDeckButton).toBeEnabled();
  });
  userEvent.click(fullTestDeckButton);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Test Deck Tally Report');
  userEvent.click(screen.getByText('Cancel'));
  expect(screen.queryByRole('alertdialog')).toEqual(null);
});
