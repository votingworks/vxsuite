import { afterEach, beforeEach, expect, test } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
import { PollingPlace } from '@votingworks/types';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client.js';
import { renderInAppContext } from '../../../test/render_in_app_context.js';
import { screen, waitFor, within } from '../../../test/react_testing_library.js';
import { SendTallyReportsScreen, TITLE } from './send_tally_reports_screen.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

const electionDefinition = readElectionTwoPartyPrimaryDefinition();

const COUNTY_ABSENTEE: PollingPlace = {
  id: 'absentee-county',
  name: 'County Absentee',
  type: 'absentee',
  precincts: {
    'precinct-1': { type: 'whole' },
    'precinct-2': { type: 'whole' },
  },
};

// Live reports polling places can be of any type, not just absentee
const DOWNTOWN_ELECTION_DAY: PollingPlace = {
  id: 'election-day-downtown',
  name: 'Downtown Election Day',
  type: 'election_day',
  precincts: {
    'precinct-1': { type: 'whole' },
    'precinct-2': { type: 'whole' },
  },
};

test('renders title and parent route link', async () => {
  apiMock.expectGetLiveReportsPollingPlaces(err('no-cvrs-loaded'));

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );
  await screen.findByText('Load CVRs to send results.');
});

test('shows info callout when no CVRs are loaded', async () => {
  apiMock.expectGetLiveReportsPollingPlaces(err('no-cvrs-loaded'));

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Load CVRs to send results.');
});

test('auto-generates QR code when exactly one polling place matches', async () => {
  apiMock.expectGetLiveReportsPollingPlaces(ok([COUNTY_ABSENTEE]));
  apiMock.expectGetLiveResultsReportingUrls(COUNTY_ABSENTEE.id, [
    'https://example.com/results?p=AAA',
  ]);

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  const qrContainer = await screen.findByTestId('live-results-code');
  expect(qrContainer.querySelector('[data-value]')).toHaveAttribute(
    'data-value',
    'https://example.com/results?p=AAA'
  );
  expect(
    screen.queryByLabelText('Select polling place')
  ).not.toBeInTheDocument();
});

test('shows danger callout when the QR code cannot be generated', async () => {
  apiMock.expectGetLiveReportsPollingPlaces(ok([COUNTY_ABSENTEE]));
  apiMock.expectGetLiveResultsReportingUrlsError(
    COUNTY_ABSENTEE.id,
    new Error('Unable to fit signed URL within QR size limits')
  );

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(/Could not generate a QR code for County Absentee/);
  expect(screen.queryByTestId('live-results-code')).not.toBeInTheDocument();
});

test('shows dropdown when multiple polling places match and allows changing the selection', async () => {
  apiMock.expectGetLiveReportsPollingPlaces(
    ok([COUNTY_ABSENTEE, DOWNTOWN_ELECTION_DAY])
  );
  apiMock.expectGetLiveResultsReportingUrls(COUNTY_ABSENTEE.id, [
    'https://example.com/results?p=AAA',
    'https://example.com/results?p=BBB',
  ]);

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  const select = await screen.findByLabelText('Select polling place');
  userEvent.click(select);
  userEvent.click(await screen.findByText('County Absentee'));

  const qrContainer = await screen.findByTestId('live-results-code');
  expect(within(qrContainer).getByText('1 / 2')).toBeInTheDocument();

  userEvent.click(screen.getButton('Next'));
  await within(qrContainer).findByText('2 / 2');
  expect(qrContainer.querySelector('[data-value]')).toHaveAttribute(
    'data-value',
    'https://example.com/results?p=BBB'
  );

  userEvent.click(screen.getButton('Previous'));
  await within(qrContainer).findByText('1 / 2');
  expect(qrContainer.querySelector('[data-value]')).toHaveAttribute(
    'data-value',
    'https://example.com/results?p=AAA'
  );

  // The polling place can be changed after the initial selection
  apiMock.expectGetLiveResultsReportingUrls(DOWNTOWN_ELECTION_DAY.id, [
    'https://example.com/results?p=CCC',
  ]);
  userEvent.click(screen.getByLabelText('Select polling place'));
  userEvent.click(await screen.findByText('Downtown Election Day'));

  const newQrContainer = await screen.findByTestId('live-results-code');
  await waitFor(() =>
    expect(newQrContainer.querySelector('[data-value]')).toHaveAttribute(
      'data-value',
      'https://example.com/results?p=CCC'
    )
  );
});
