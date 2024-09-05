import {
  ManualResultsIdentifier,
  ImportElectionResultsReportingError,
} from '@votingworks/admin-backend';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { assertDefined, deferred, err, ok, Result } from '@votingworks/basics';
import { ElectronFile, mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import {
  mockKiosk,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { join } from 'path';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { DippedSmartCardAuth } from '@votingworks/types';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ImportElectionsResultReportingFileModal } from './import_election_results_reporting_file_modal';
import { fireEvent, screen } from '../../test/react_testing_library';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  window.kiosk = mockKiosk();
});

afterEach(() => {
  delete window.kiosk;
  apiMock.assertComplete();
});

function getTestConfig(): {
  filename: string;
  filepath: string;
  ballotStyleId: string;
  precinctId: string;
  identifier: ManualResultsIdentifier;
} {
  const filename = './example-election-result.json';
  const filepath = join('/tmp', filename);

  const ballotStyleId = assertDefined(
    electionGeneralDefinition.election.ballotStyles[0]
  ).id;
  const precinctId = assertDefined(
    electionGeneralDefinition.election.precincts[0]
  ).id;

  const identifier: ManualResultsIdentifier = {
    precinctId,
    ballotStyleId,
    votingMethod: 'precinct',
  };

  return { filename, filepath, ballotStyleId, precinctId, identifier };
}

test('can upload an ERR file and close modal', async () => {
  const { filename, filepath, ballotStyleId, precinctId, identifier } =
    getTestConfig();

  apiMock.expectImportElectionResultReportingFileMutation({
    ...identifier,
    filepath,
  });

  const closeFn = jest.fn();

  renderInAppContext(
    <ImportElectionsResultReportingFileModal
      onClose={closeFn}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votingMethod="precinct"
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    }
  );

  await screen.findByText(
    'Results may be imported as an Election Results Reporting Common Data Format (ERR CDF) file. Choose an ERR CDF file to import.'
  );

  const file: ElectronFile = {
    ...new File([''], filename),
    path: filepath,
  };
  fireEvent.change(screen.getByTestId('manual-input'), {
    target: { files: [file] },
  });

  await screen.findByText('Results Imported');

  expect(closeFn).toHaveBeenCalledTimes(0);
  userEvent.click(await screen.findByText('Close'));
  expect(closeFn).toHaveBeenCalledTimes(1);
});

const usbStatuses: Array<UsbDriveStatus['status']> = [
  'no_drive',
  'ejected',
  'error',
];
test.each(usbStatuses)(
  'shows a message if USB status is: %s',
  async (status: UsbDriveStatus['status']) => {
    const { ballotStyleId, precinctId } = getTestConfig();

    const closeFn = jest.fn();

    renderInAppContext(
      <ImportElectionsResultReportingFileModal
        onClose={closeFn}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        votingMethod="precinct"
      />,
      {
        usbDriveStatus: mockUsbDriveStatus(status),
        apiMock,
      }
    );

    await screen.findByText(
      'Please insert a USB drive in order to import a results file.'
    );

    expect(closeFn).toHaveBeenCalledTimes(0);
    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
  }
);

test('loading state', async () => {
  const { filename, filepath, ballotStyleId, precinctId, identifier } =
    getTestConfig();

  const { promise, resolve } =
    deferred<Result<void, ImportElectionResultsReportingError>>();
  apiMock.apiClient.importElectionResultsReportingFile
    .expectCallWith({
      ...identifier,
      filepath,
    })
    .returns(promise);

  const closeFn = jest.fn();
  renderInAppContext(
    <ImportElectionsResultReportingFileModal
      onClose={closeFn}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votingMethod="precinct"
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    }
  );

  await screen.findByText(
    'Results may be imported as an Election Results Reporting Common Data Format (ERR CDF) file. Choose an ERR CDF file to import.'
  );

  const file: ElectronFile = {
    ...new File([''], filename),
    path: filepath,
  };
  fireEvent.change(screen.getByTestId('manual-input'), {
    target: { files: [file] },
  });

  await screen.findByText('Importing Results');

  resolve(ok());
});

interface ErrorTestSpec {
  error: ImportElectionResultsReportingError;
  message: string;
}

const errorTests: ErrorTestSpec[] = [
  {
    error: {
      type: 'conversion-failed',
    },
    message:
      'File is not a valid Election Results Reporting CDF file. Please ensure you are using the correct file format.',
  },
  {
    error: {
      type: 'parsing-failed',
    },
    message: 'File is unreadable. Try exporting it again.',
  },
];

test.each(errorTests)(
  'handles error returned by API: $error.type',
  async ({ error, message }) => {
    const { filename, filepath, ballotStyleId, precinctId, identifier } =
      getTestConfig();

    apiMock.apiClient.importElectionResultsReportingFile
      .expectCallWith({
        ...identifier,
        filepath,
      })
      .resolves(err(error));

    const closeFn = jest.fn();
    renderInAppContext(
      <ImportElectionsResultReportingFileModal
        onClose={closeFn}
        ballotStyleId={ballotStyleId}
        precinctId={precinctId}
        votingMethod="precinct"
      />,
      {
        usbDriveStatus: mockUsbDriveStatus('mounted'),
        apiMock,
      }
    );

    await screen.findByText(
      'Results may be imported as an Election Results Reporting Common Data Format (ERR CDF) file. Choose an ERR CDF file to import.'
    );

    const file: ElectronFile = {
      ...new File([''], filename),
      path: filepath,
    };
    fireEvent.change(screen.getByTestId('manual-input'), {
      target: { files: [file] },
    });

    await screen.findByText('Failed to Import Results');
    screen.getByText(message);

    expect(closeFn).toHaveBeenCalledTimes(0);
    userEvent.click(screen.getByText('Close'));
    expect(closeFn).toHaveBeenCalledTimes(1);
  }
);

test('handles no file input', async () => {
  const { ballotStyleId, precinctId } = getTestConfig();

  const closeFn = jest.fn();

  renderInAppContext(
    <ImportElectionsResultReportingFileModal
      onClose={closeFn}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votingMethod="precinct"
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
    }
  );

  await screen.findByText(
    'Results may be imported as an Election Results Reporting Common Data Format (ERR CDF) file. Choose an ERR CDF file to import.'
  );

  expect(closeFn).toHaveBeenCalledTimes(0);
  fireEvent.change(screen.getByTestId('manual-input'), {
    target: { files: null },
  });
  expect(closeFn).toHaveBeenCalledTimes(1);
});

test('can render with system admin auth', async () => {
  const { ballotStyleId, precinctId } = getTestConfig();

  const auth: DippedSmartCardAuth.SystemAdministratorLoggedIn = {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };

  const closeFn = jest.fn();

  renderInAppContext(
    <ImportElectionsResultReportingFileModal
      onClose={closeFn}
      ballotStyleId={ballotStyleId}
      precinctId={precinctId}
      votingMethod="precinct"
    />,
    {
      usbDriveStatus: mockUsbDriveStatus('mounted'),
      apiMock,
      auth,
    }
  );

  await screen.findByText('Import Results File');
});
