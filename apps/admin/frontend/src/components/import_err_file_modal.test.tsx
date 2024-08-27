import { ManualResultsIdentifier } from '@votingworks/admin-backend';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { assertDefined, err } from '@votingworks/basics';
import { ElectronFile, mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { mockKiosk } from '@votingworks/test-utils';
import { join } from 'path';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ImportElectionsResultReportingFileModal } from './import_err_file_modal';
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

  await screen.findByText('Choose an Election Results Reporting file to load.');

  const file: ElectronFile = {
    ...new File([''], filename),
    path: filepath,
  };
  fireEvent.change(screen.getByTestId('manual-input'), {
    target: { files: [file] },
  });

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
      'Please insert a USB drive in order to load ERR file.'
    );

    expect(closeFn).toHaveBeenCalledTimes(0);
    userEvent.click(screen.getByText('Cancel'));
    expect(closeFn).toHaveBeenCalledTimes(1);
  }
);

test('handles errors', async () => {
  const { filename, filepath, ballotStyleId, precinctId, identifier } =
    getTestConfig();

  apiMock.apiClient.importElectionResultsReportingFile
    .expectCallWith({
      ...identifier,
      filepath,
    })
    .resolves(err(new Error('Test error')));

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

  await screen.findByText('Choose an Election Results Reporting file to load.');

  const file: ElectronFile = {
    ...new File([''], filename),
    path: filepath,
  };
  fireEvent.change(screen.getByTestId('manual-input'), {
    target: { files: [file] },
  });

  await screen.findByText(/There was an error reading the contents of/);

  expect(closeFn).toHaveBeenCalledTimes(0);
  userEvent.click(screen.getByText('Close'));
  expect(closeFn).toHaveBeenCalledTimes(1);
});

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

  await screen.findByText('Choose an Election Results Reporting file to load.');

  expect(closeFn).toHaveBeenCalledTimes(0);
  fireEvent.change(screen.getByTestId('manual-input'), {
    target: { files: undefined },
  });
  expect(closeFn).toHaveBeenCalledTimes(1);
});
