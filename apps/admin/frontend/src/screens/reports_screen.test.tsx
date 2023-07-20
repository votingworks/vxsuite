import MockDate from 'mockdate';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import { waitFor } from '@testing-library/react';
import {
  fakeKiosk,
  fakeUsbDrive,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import { typedAs } from '@votingworks/basics';
import { mockUsbDrive } from '@votingworks/ui';
import { ReportsScreen } from './reports_screen';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';
import { screen, userEvent, within } from '../../test/react_testing_library';
import { VxFiles } from '../lib/converters';
import {
  expectReportsScreenCardCountQueries,
  mockBallotCountsTableGroupBy,
} from '../../test/helpers/api_expect_helpers';

let apiMock: ApiMock;

beforeEach(() => {
  MockDate.set(new Date('2020-11-03T22:22:00'));
  apiMock = createApiMock();
  fetchMock.reset();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionMinimalExhaustiveSampleDefinition;

test('exporting SEMS results', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;

  const logger = fakeLogger();

  fetchMock.get(
    '/convert/tallies/files',
    typedAs<VxFiles>({
      inputFiles: [{ name: 'name' }, { name: 'name' }],
      outputFiles: [{ name: 'name' }],
    })
  );

  apiMock.expectGetSemsExportableTallies({
    talliesByPrecinct: {},
  });
  apiMock.expectGetCastVoteRecordFileMode('test');
  expectReportsScreenCardCountQueries({
    apiMock,
    isPrimary: true,
  });
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetManualResultsMetadata([]);

  renderInAppContext(<ReportsScreen />, {
    electionDefinition,
    apiMock,
    converter: 'ms-sems',
    logger,
    usbDrive: mockUsbDrive('mounted'),
  });

  fetchMock.post(
    '/convert/tallies/submitfile',
    { body: { status: 'ok' } },
    { repeat: 2 }
  );
  fetchMock.postOnce('/convert/tallies/process', { body: { status: 'ok' } });
  fetchMock.getOnce('/convert/tallies/output?name=name', {
    body: 'test-content',
  });
  fetchMock.postOnce('/convert/reset', { body: { status: 'ok' } });

  await screen.findButton('Save SEMS Results');
  await userEvent.click(screen.getByText('Save SEMS Results'));
  screen.getByText(
    'votingworks-sems-test-results_sample-county_example-primary-election_2020-11-03_22-22-00.txt'
  );

  await userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving/);
  await screen.findByText(/Results Saved/);
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenLastCalledWith(
      '/media/vx/mock-usb-drive/votingworks-sems-test-results_sample-county_example-primary-election_2020-11-03_22-22-00.txt',
      'test-content'
    );
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ConvertingResultsToSemsFormat,
    expect.any(String)
  );
  expect(fetchMock.called('/convert/tallies/files')).toEqual(true);
  expect(fetchMock.calls('/convert/tallies/submitfile')).toHaveLength(2);
  expect(fetchMock.called('/convert/tallies/process')).toEqual(true);
  expect(fetchMock.called('/convert/tallies/output?name=name')).toEqual(true);
  expect(fetchMock.called('/convert/reset')).toEqual(true);
});

test('exporting batch results', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;

  apiMock.expectGetCastVoteRecordFileMode('test');
  expectReportsScreenCardCountQueries({
    apiMock,
    isPrimary: true,
  });
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetManualResultsMetadata([]);

  renderInAppContext(<ReportsScreen />, {
    electionDefinition,
    apiMock,
    usbDrive: mockUsbDrive('mounted'),
  });

  apiMock.expectGetCardCounts(
    mockBallotCountsTableGroupBy({ groupByBatch: true }),
    []
  );
  await userEvent.click(screen.getButton('Show Results by Batch and Scanner'));
  await waitFor(() => {
    expect(screen.getButton('Save Batch Results as CSV')).toBeEnabled();
  });
  await userEvent.click(screen.getButton('Save Batch Results as CSV'));
  await screen.findByRole('alertdialog');

  await screen.findByText('Save Batch Results');
  await screen.findByText(
    'votingworks-test-batch-results_sample-county_example-primary-election_2020-11-03_22-22-00.csv'
  );

  apiMock.expectExportBatchResults(
    '/media/vx/mock-usb-drive/votingworks-test-batch-results_sample-county_example-primary-election_2020-11-03_22-22-00.csv'
  );
  await userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Batch Results Saved/);
});

test('exporting results csv', async () => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  window.kiosk = mockKiosk;

  apiMock.expectGetCastVoteRecordFileMode('test');
  expectReportsScreenCardCountQueries({
    apiMock,
    isPrimary: true,
  });
  apiMock.expectGetScannerBatches([]);
  apiMock.expectGetManualResultsMetadata([]);

  renderInAppContext(<ReportsScreen />, {
    electionDefinition,
    apiMock,
    usbDrive: mockUsbDrive('mounted'),
  });

  await waitFor(() => {
    expect(screen.getButton('Save Results')).toBeEnabled();
  });
  await userEvent.click(screen.getButton('Save Results'));

  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Save Results' });
  within(modal).getByText(
    'votingworks-test-results_sample-county_example-primary-election_2020-11-03_22-22-00.csv'
  );

  apiMock.expectExportResultsCsv(
    '/media/vx/mock-usb-drive/votingworks-test-results_sample-county_example-primary-election_2020-11-03_22-22-00.csv'
  );
  await userEvent.click(within(modal).getButton('Save'));
  await screen.findByText(/Results Saved/);
});

describe('ballot count summary text', () => {
  test('unlocked mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    expectReportsScreenCardCountQueries({
      apiMock,
      isPrimary: true,
    });
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      hasTextAcrossElements(
        '0 ballots have been counted for Example Primary Election.'
      )
    );
  });

  test('official mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('official');
    expectReportsScreenCardCountQueries({
      apiMock,
      isPrimary: true,
      overallCardCount: {
        bmd: 1000,
        hmpb: [1000],
        manual: 1000,
      },
    });
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      hasTextAcrossElements(
        '3,000 official ballots have been counted for Example Primary Election.'
      )
    );
  });

  test('test mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('test');
    expectReportsScreenCardCountQueries({
      apiMock,
      isPrimary: true,
      overallCardCount: {
        bmd: 1000,
        hmpb: [1000],
        manual: 1000,
      },
    });
    apiMock.expectGetScannerBatches([]);
    apiMock.expectGetManualResultsMetadata([]);

    renderInAppContext(<ReportsScreen />, {
      electionDefinition,
      apiMock,
    });

    await screen.findByText(
      hasTextAcrossElements(
        '3,000 test ballots have been counted for Example Primary Election.'
      )
    );
  });
});
