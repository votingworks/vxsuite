import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { expectPrint } from '@votingworks/test-utils';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { FullTestDeckTallyReportButton } from './full_test_deck_tally_report_button';

test('prints appropriate reports for primary election', async () => {
  renderInAppContext(<FullTestDeckTallyReportButton />, {
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
  });

  userEvent.click(await screen.findByText('Print Full Test Deck Tally Report'));
  await screen.findByText('Printing');

  await expectPrint((printedElement, printOptions) => {
    const reports = printedElement.getAllByTestId('election-full-tally-report');
    const mammalReport = within(reports[0]);
    mammalReport.getByText(
      'Test Deck Mammal Party Example Primary Election Tally Report'
    );
    expect(mammalReport.getByTestId('total')).toHaveTextContent(
      'Total Ballots Cast56'
    );

    const fishReport = within(reports[1]);
    fishReport.getByText(
      'Test Deck Fish Party Example Primary Election Tally Report'
    );
    expect(fishReport.getByTestId('total')).toHaveTextContent(
      'Total Ballots Cast48'
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
    expect(printedElement.getByTestId('total')).toHaveTextContent(
      'Total Ballots Cast208'
    );

    expect(printOptions).toMatchObject({ sides: 'one-sided' });
  });
});
