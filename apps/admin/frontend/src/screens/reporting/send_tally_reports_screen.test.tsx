import { afterEach, beforeEach, expect, test } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
import { PollingPlace } from '@votingworks/types';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { screen, within } from '../../../test/react_testing_library';
import { SendTallyReportsScreen, TITLE } from './send_tally_reports_screen';

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

const REGIONAL_ABSENTEE: PollingPlace = {
  id: 'absentee-regional',
  name: 'Regional Absentee',
  type: 'absentee',
  precincts: {
    'precinct-1': { type: 'whole' },
    'precinct-2': { type: 'whole' },
  },
};

test('renders title and parent route link', async () => {
  apiMock.expectGetMatchingAbsenteePollingPlaces(err('no-cvrs-loaded'));

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
  apiMock.expectGetMatchingAbsenteePollingPlaces(err('no-cvrs-loaded'));

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText('Load CVRs to send results.');
});

test('shows warning when no absentee polling place matches the loaded CVRs', async () => {
  apiMock.expectGetMatchingAbsenteePollingPlaces(ok([]));

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  await screen.findByText(
    'No absentee polling place covers the precincts in the loaded CVRs.'
  );
});

test('auto-generates QR code when exactly one polling place matches', async () => {
  apiMock.expectGetMatchingAbsenteePollingPlaces(ok([COUNTY_ABSENTEE]));
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
    screen.queryByLabelText('Select absentee polling place')
  ).not.toBeInTheDocument();
});

test('shows danger callout when the QR code cannot be generated', async () => {
  apiMock.expectGetMatchingAbsenteePollingPlaces(ok([COUNTY_ABSENTEE]));
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

test('shows dropdown when multiple polling places match and locks after selection', async () => {
  apiMock.expectGetMatchingAbsenteePollingPlaces(
    ok([COUNTY_ABSENTEE, REGIONAL_ABSENTEE])
  );
  apiMock.expectGetLiveResultsReportingUrls(COUNTY_ABSENTEE.id, [
    'https://example.com/results?p=AAA',
    'https://example.com/results?p=BBB',
  ]);

  renderInAppContext(<SendTallyReportsScreen />, {
    electionDefinition,
    apiMock,
  });

  const select = await screen.findByLabelText('Select absentee polling place');
  userEvent.click(select);
  userEvent.click(await screen.findByText('County Absentee'));

  const qrContainer = await screen.findByTestId('live-results-code');
  expect(within(qrContainer).getByText('1 / 2')).toBeInTheDocument();

  // The dropdown is now locked.
  expect(screen.getByLabelText('Select absentee polling place')).toBeDisabled();

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
});
