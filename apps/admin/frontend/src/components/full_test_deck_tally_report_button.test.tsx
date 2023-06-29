import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import {
  expectPrint,
  fakeFileWriter,
  fakeKiosk,
  fakeUsbDrive,
} from '@votingworks/test-utils';
import React from 'react';
import { mockUsbDrive } from '@votingworks/ui';
import { screen, within } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { FullTestDeckTallyReportButton } from './full_test_deck_tally_report_button';

beforeEach(() => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.writeFile = jest.fn().mockResolvedValue(fileWriter);
  window.kiosk = mockKiosk;
});

test('prints appropriate reports for primary election', async () => {
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });

  userEvent.click(await screen.findByText('Print Full Test Deck Tally Report'));
  await screen.findByText('Printing');

  await expectPrint((printedElement, printOptions) => {
    const reports = printedElement.getAllByTestId(/test-deck-tally-report/);
    const mammalReport = within(reports[0]);
    mammalReport.getByText(
      'Test Deck Mammal Party Example Primary Election Tally Report'
    );
    expect(mammalReport.getByTestId('total-ballot-count')).toHaveTextContent(
      '56'
    );

    const fishReport = within(reports[1]);
    fishReport.getByText(
      'Test Deck Fish Party Example Primary Election Tally Report'
    );
    expect(fishReport.getByTestId('total-ballot-count')).toHaveTextContent(
      '48'
    );

    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
});

test('prints appropriate report for general election', async () => {
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
  });

  userEvent.click(await screen.findByText('Print Full Test Deck Tally Report'));
  await screen.findByText('Printing');

  await expectPrint((printedElement, printOptions) => {
    printedElement.getByText(
      'Test Deck Lincoln Municipal General Election Tally Report'
    );
    expect(printedElement.getByTestId('total-ballot-count')).toHaveTextContent(
      '208'
    );

    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
});

test('renders SaveFileToUsb component for saving PDF', async () => {
  const usbDrive = mockUsbDrive('mounted');
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    usbDrive,
  });
  userEvent.click(screen.getByText('Save Full Test Deck Tally Report as PDF'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Test Deck Tally Report');
});

test('closes SaveFileToUsb modal', async () => {
  const usbDrive = mockUsbDrive('mounted');
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
    usbDrive,
  });
  userEvent.click(screen.getByText('Save Full Test Deck Tally Report as PDF'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Test Deck Tally Report');
  userEvent.click(screen.getByText('Cancel'));
  expect(screen.queryByRole('alertdialog')).toEqual(null);
});
