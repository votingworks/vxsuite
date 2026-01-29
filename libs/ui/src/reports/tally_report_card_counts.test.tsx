import { expect, test } from 'vitest';
import { within } from '@testing-library/react';
import { render, screen } from '../../test/react_testing_library';

import { TallyReportCardCounts } from './tally_report_card_counts';

test('all counts, multiple sheets', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [4],
        hmpb: [23, undefined, 12],
        manual: 5,
      }}
    />
  );

  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('32');

  const scannedRow = screen.getByText('Scanned').closest('tr')!;
  within(scannedRow).getByText('27');

  const sheet1Row = scannedRow.nextSibling as HTMLElement;
  within(sheet1Row).getByText('Sheet 1');
  within(sheet1Row).getByText('27');
  const sheet2Row = sheet1Row.nextSibling as HTMLElement;
  within(sheet2Row).getByText('Sheet 2');
  within(sheet2Row).getByText('0');
  const sheet3Row = sheet2Row.nextSibling as HTMLElement;
  within(sheet3Row).getByText('Sheet 3');
  within(sheet3Row).getByText('12');

  const manualRow = screen.getByText('Manually Entered').closest('tr')!;
  within(manualRow).getByText('5');
});

test('only BMD count', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [4],
        hmpb: [],
      }}
    />
  );

  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('4');
  expect(screen.getAllByRole('row')).toHaveLength(1);
});

test('only single HMPB sheet + BMD counts', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [10],
        hmpb: [15],
      }}
    />
  );
  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('25');
  expect(screen.getAllByRole('row')).toHaveLength(1);
});

test('only single HMPB count', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [],
        hmpb: [15],
      }}
    />
  );
  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('15');
  expect(screen.getAllByRole('row')).toHaveLength(1);
});

test('only manual count', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [],
        hmpb: [],
        manual: 7,
      }}
    />
  );

  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('7');

  const scannedRow = screen.getByText('Scanned').closest('tr')!;
  within(scannedRow).getByText('0');

  const manualRow = screen.getByText('Manually Entered').closest('tr')!;
  within(manualRow).getByText('7');
});

test('all counts, single HMPB sheet', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [3],
        hmpb: [20],
        manual: 2,
      }}
    />
  );

  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('25');

  const scannedRow = screen.getByText('Scanned').closest('tr')!;
  within(scannedRow).getByText('23');

  expect(screen.queryByText('Sheet 1')).not.toBeInTheDocument();
  expect(screen.queryByText('Sheet 2')).not.toBeInTheDocument();

  const manualRow = screen.getByText('Manually Entered').closest('tr')!;
  within(manualRow).getByText('2');
});

test('multi-page BMD sheets, no HMPB', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [1, 1],
        hmpb: [],
      }}
    />
  );

  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('1');

  expect(screen.queryByText('Scanned')).not.toBeInTheDocument();

  const sheet1Row = ballotCountRow.nextSibling as HTMLElement;
  within(sheet1Row).getByText('Sheet 1');
  within(sheet1Row).getByText('1');
  const sheet2Row = sheet1Row.nextSibling as HTMLElement;
  within(sheet2Row).getByText('Sheet 2');
  within(sheet2Row).getByText('1');
});

test('multiple HMPB sheets, no manual', () => {
  render(
    <TallyReportCardCounts
      cardCounts={{
        bmd: [1],
        hmpb: [10, 5, 8],
      }}
    />
  );

  const ballotCountRow = screen.getByText('Ballot Count').closest('tr')!;
  within(ballotCountRow).getByText('11');

  expect(screen.queryByText('Scanned')).not.toBeInTheDocument();

  const sheet1Row = ballotCountRow.nextSibling as HTMLElement;
  within(sheet1Row).getByText('Sheet 1');
  within(sheet1Row).getByText('11');
  const sheet2Row = sheet1Row.nextSibling as HTMLElement;
  within(sheet2Row).getByText('Sheet 2');
  within(sheet2Row).getByText('5');
  const sheet3Row = sheet2Row.nextSibling as HTMLElement;
  within(sheet3Row).getByText('Sheet 3');
  within(sheet3Row).getByText('8');
});
