import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import userEvent from '@testing-library/user-event';
import {
  fakeKiosk,
  fakeUsbDrive,
  hasTextAcrossElements,
} from '@votingworks/test-utils';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import { typedAs } from '@votingworks/basics';
import { ReportsScreen } from './reports_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { screen, waitFor } from '../../../test/react_testing_library';
import { VxFiles } from '../../lib/converters';
import { mockUsbDriveStatus } from '../../../test/helpers/mock_usb_drive';
import { getMockCardCounts } from '../../../test/helpers/mock_results';

let apiMock: ApiMock;

jest.useFakeTimers();

beforeEach(() => {
  jest.setSystemTime(new Date('2020-11-03T22:22:00'));
  apiMock = createApiMock();
  fetchMock.reset();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = electionTwoPartyPrimaryDefinition;

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
  apiMock.expectGetCardCounts({}, [getMockCardCounts(100)]);
  apiMock.expectGetSemsExportableTallies({
    talliesByPrecinct: {},
  });
  apiMock.expectGetCastVoteRecordFileMode('test');

  renderInAppContext(<ReportsScreen />, {
    electionDefinition,
    apiMock,
    converter: 'ms-sems',
    logger,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
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
  userEvent.click(screen.getByText('Save SEMS Results'));
  screen.getByText(
    'votingworks-sems-test-results_sample-county_example-primary-election_2020-11-03_22-22-00.txt'
  );

  userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Saving/);
  await screen.findByText(/Results Saved/);
  await waitFor(() => {
    expect(mockKiosk.writeFile).toHaveBeenCalledTimes(1);
    expect(mockKiosk.writeFile).toHaveBeenLastCalledWith(
      'test-mount-point/votingworks-sems-test-results_sample-county_example-primary-election_2020-11-03_22-22-00.txt',
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
  apiMock.expectGetCastVoteRecordFileMode('test');
  apiMock.expectGetCardCounts({}, [getMockCardCounts(100)]);

  renderInAppContext(<ReportsScreen />, {
    electionDefinition,
    apiMock,
    usbDriveStatus: mockUsbDriveStatus('mounted'),
  });

  await waitFor(() => {
    expect(screen.getButton('Save Batch Results CSV')).toBeEnabled();
  });
  userEvent.click(screen.getButton('Save Batch Results CSV'));
  await screen.findByRole('alertdialog');

  await screen.findByText('Save Batch Results');
  await screen.findByText(
    'votingworks-test-batch-results_sample-county_example-primary-election_2020-11-03_22-22-00.csv'
  );

  apiMock.expectExportBatchResults(
    'test-mount-point/votingworks-test-batch-results_sample-county_example-primary-election_2020-11-03_22-22-00.csv'
  );
  userEvent.click(screen.getByText('Save'));
  await screen.findByText(/Batch Results Saved/);
});

describe('ballot count summary text', () => {
  test('unlocked mode', async () => {
    apiMock.expectGetCastVoteRecordFileMode('unlocked');
    apiMock.expectGetCardCounts({}, [getMockCardCounts(0)]);

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
    apiMock.expectGetCardCounts({}, [getMockCardCounts(3000)]);

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
    apiMock.expectGetCardCounts({}, [getMockCardCounts(3000)]);

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
