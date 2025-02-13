import { afterEach, beforeEach, expect, test } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { ApiMock, createApiMock } from '../../../test/helpers/mock_api_client';
import {
  FullElectionTallyReportScreen,
  TITLE,
} from './full_election_tally_report_screen';
import { renderInAppContext } from '../../../test/render_in_app_context';
import { routerPaths } from '../../router_paths';
import { screen } from '../../../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('displays report', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  apiMock.expectGetCastVoteRecordFileMode('official');
  apiMock.setPrinterStatus({ connected: true });
  apiMock.expectGetTallyReportPreview({
    reportSpec: {
      filter: {},
      groupBy: {},
      includeSignatureLines: true,
    },
    pdfContent: 'Full Election Tally Report Mock Preview',
  });

  renderInAppContext(<FullElectionTallyReportScreen />, {
    electionDefinition,
    apiMock,
    route: routerPaths.tallyFullReport,
    isOfficialResults: true,
  });

  await screen.findByText('Full Election Tally Report Mock Preview');

  screen.getByRole('heading', { name: TITLE });
  expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'href',
    '/reports'
  );

  screen.getButton('Export CDF Report');
});
