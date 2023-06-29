import { within } from '@testing-library/react';
import { render, screen } from '../../test/react_testing_library';

import { TallyReportCardCounts } from './tally_report_card_counts';

test('renders all provided data', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: 4,
        hmpb: [23, undefined, 12],
        manual: 5,
      }}
    />
  );

  screen.getByText('Ballot Counts');
  const hmpbRow = screen.getByText('Hand Marked').closest('tr')!;
  within(hmpbRow).getByText('23');

  const sheet1Row = hmpbRow.nextSibling as HTMLElement;
  within(sheet1Row).getByText('Sheet 1');
  within(sheet1Row).getByText('23');
  const sheet2Row = sheet1Row.nextSibling as HTMLElement;
  within(sheet2Row).getByText('Sheet 2');
  within(sheet2Row).getByText('0');
  const sheet3Row = sheet2Row.nextSibling as HTMLElement;
  within(sheet3Row).getByText('Sheet 3');
  within(sheet3Row).getByText('12');

  const bmdRow = screen.getByText('Machine Marked').closest('tr')!;
  within(bmdRow).getByText('4');

  const manualRow = screen.getByText('Manually Entered').closest('tr')!;
  within(manualRow).getByText('5');

  const totalRow = screen.getByText('Total').closest('tr')!;
  within(totalRow).getByText('32');
});

test('omits manual data and sheet counts when not relevant', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: 4,
        hmpb: [],
      }}
    />
  );

  screen.getByText('Ballot Counts');
  const hmpbRow = screen.getByText('Hand Marked').closest('tr')!;
  within(hmpbRow).getByText('0');

  expect(screen.queryByText('Sheet 1')).toBeNull();
  expect(screen.queryByText('Sheet 2')).toBeNull();

  const bmdRow = screen.getByText('Machine Marked').closest('tr')!;
  within(bmdRow).getByText('4');

  expect(screen.queryByText('Manually Entered')).toBeNull();

  const totalRow = screen.getByText('Total').closest('tr')!;
  within(totalRow).getByText('4');
});
