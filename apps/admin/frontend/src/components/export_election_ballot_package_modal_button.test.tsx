import { interpretTemplate } from '@votingworks/ballot-interpreter-vx';
import { fakeLogger, LogEventId } from '@votingworks/logging';
import { fakeKiosk, fakeUsbDrive, mockOf } from '@votingworks/test-utils';
import React from 'react';
import { BallotPageLayoutWithImage, BallotType } from '@votingworks/types';
import { UsbDriveStatus } from '@votingworks/ui';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { fakeFileWriter } from '../../test/helpers/fake_file_writer';
import {
  eitherNeitherElectionDefinition,
  renderInAppContext,
} from '../../test/render_in_app_context';
import { ExportElectionBallotPackageModalButton } from './export_election_ballot_package_modal_button';
import { pdfToImages } from '../utils/pdf_to_images';
import { mockUsbDrive } from '../../test/helpers/mock_usb_drive';

jest.mock('@votingworks/ballot-interpreter-vx');
jest.mock('../components/hand_marked_paper_ballot');
jest.mock('../utils/pdf_to_images');

beforeEach(() => {
  const mockKiosk = fakeKiosk();
  mockKiosk.getUsbDriveInfo.mockResolvedValue([fakeUsbDrive()]);
  const fileWriter = fakeFileWriter();
  mockKiosk.saveAs = jest.fn().mockResolvedValue(fileWriter);
  mockKiosk.writeFile = jest.fn().mockResolvedValue(fileWriter);
  window.kiosk = mockKiosk;

  mockOf(pdfToImages).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/require-await
    async function* pdfToImagesMock(): AsyncGenerator<{
      page: ImageData;
      pageNumber: number;
      pageCount: number;
    }> {
      yield {
        page: { data: Uint8ClampedArray.of(0, 0, 0, 0), width: 1, height: 1 },
        pageNumber: 1,
        pageCount: 2,
      };
      yield {
        page: { data: Uint8ClampedArray.of(0, 0, 0, 0), width: 1, height: 1 },
        pageNumber: 2,
        pageCount: 2,
      };
    }
  );

  mockOf(interpretTemplate).mockImplementation(
    async ({
      electionDefinition,
      imageData,
      metadata,
      // eslint-disable-next-line @typescript-eslint/require-await
    }): Promise<BallotPageLayoutWithImage> => ({
      imageData,
      ballotPageLayout: {
        contests: [],
        metadata: metadata ?? {
          ballotType: BallotType.Standard,
          ballotStyleId: '123',
          precinctId: '123',
          electionHash: electionDefinition.electionHash,
          isTestMode: false,
          locales: { primary: 'en-US' },
          pageNumber: 1,
        },
        pageSize: {
          width: imageData.width,
          height: imageData.height,
        },
      },
    })
  );
});

afterEach(() => {
  delete window.kiosk;
});

test('Button renders properly when not clicked', () => {
  const { queryByTestId } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />
  );

  screen.getButton('Save Ballot Package');
  expect(queryByTestId('modal')).toBeNull();
});

test('Modal renders insert usb screen appropriately', async () => {
  const usbStatuses: UsbDriveStatus[] = ['absent', 'ejected', 'bad_format'];

  for (const usbStatus of usbStatuses) {
    const {
      unmount,
      getByText,
      queryAllByText,
      queryAllByAltText,
      queryAllByTestId,
    } = renderInAppContext(<ExportElectionBallotPackageModalButton />, {
      usbDrive: mockUsbDrive(usbStatus),
    });
    fireEvent.click(getByText('Save Ballot Package'));
    await waitFor(() => getByText('No USB Drive Detected'));
    expect(queryAllByAltText('Insert USB Image')).toHaveLength(1);
    expect(queryAllByTestId('modal')).toHaveLength(1);
    expect(
      queryAllByText(
        'Please insert a USB drive in order to save the ballot configuration.'
      )
    ).toHaveLength(1);

    fireEvent.click(getByText('Cancel'));
    expect(queryAllByTestId('modal')).toHaveLength(0);

    unmount();
  }
});

test('Modal renders export confirmation screen when usb detected and manual link works as expected', async () => {
  const logger = fakeLogger();
  renderInAppContext(<ExportElectionBallotPackageModalButton />, {
    usbDrive: mockUsbDrive('mounted'),
    logger,
  });
  fireEvent.click(screen.getByText('Save Ballot Package'));
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByText('Save Ballot Package');
  within(modal).getByAltText('Insert USB Image');
  within(modal).getByText(
    /A zip archive will automatically be saved to the default location on the mounted USB drive./
  );
  within(modal).getByText(/Optionally, you may pick a custom save location./);

  fireEvent.click(within(modal).getByText('Custom'));
  await within(modal).findByText('Ballot Package Saved');
  await waitFor(() => {
    expect(interpretTemplate).toHaveBeenCalledTimes(
      2 /* pages per ballot */ *
        2 /* test & live */ *
        eitherNeitherElectionDefinition.election.ballotStyles.reduce(
          (acc, bs) => acc + bs.precincts.length,
          0
        )
    );
    expect(window.kiosk!.saveAs).toHaveBeenCalledTimes(1);
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.SaveBallotPackageInit,
    'election_manager'
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.SaveBallotPackageComplete,
    'election_manager',
    expect.objectContaining({ disposition: 'success' })
  );

  fireEvent.click(within(modal).getByText('Close'));
  expect(screen.queryAllByTestId('modal')).toHaveLength(0);
});

test('Modal renders loading screen when usb drive is mounting or ejecting', async () => {
  const usbStatuses: UsbDriveStatus[] = ['mounting', 'ejecting'];

  for (const usbStatus of usbStatuses) {
    const { unmount, queryAllByTestId, getByText } = renderInAppContext(
      <ExportElectionBallotPackageModalButton />,
      {
        usbDrive: mockUsbDrive(usbStatus),
      }
    );
    fireEvent.click(screen.getButton('Save Ballot Package'));
    await waitFor(() => getByText('Loading'));

    expect(queryAllByTestId('modal')).toHaveLength(1);

    expect(screen.getButton('Cancel')).toBeDisabled();
    unmount();
  }
});

test('Modal renders error message appropriately', async () => {
  const logger = fakeLogger();
  window.kiosk!.saveAs = jest.fn().mockResolvedValue(undefined);
  const { queryAllByTestId, getByText, queryAllByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDrive: mockUsbDrive('mounted'),
      logger,
    }
  );
  fireEvent.click(getByText('Save Ballot Package'));
  await waitFor(() => getByText('Save'));

  fireEvent.click(getByText('Custom'));

  await waitFor(() => getByText('Failed to Save Ballot Package'));
  expect(queryAllByTestId('modal')).toHaveLength(1);
  expect(queryAllByText(/An error occurred:/)).toHaveLength(1);
  expect(queryAllByText(/could not save; no file was chosen/)).toHaveLength(1);

  fireEvent.click(getByText('Close'));
  expect(queryAllByTestId('modal')).toHaveLength(0);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.SaveBallotPackageInit,
    'election_manager'
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.SaveBallotPackageComplete,
    'election_manager',
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('Modal renders renders loading message while rendering ballots appropriately', async () => {
  const usbDrive = mockUsbDrive('mounted');
  const { queryAllByTestId, getByText, queryByText } = renderInAppContext(
    <ExportElectionBallotPackageModalButton />,
    {
      usbDrive,
    }
  );
  fireEvent.click(getByText('Save Ballot Package'));
  await waitFor(() => getByText('Save'));

  fireEvent.click(getByText('Save'));

  await screen.findByText('Ballot Package Saved');
  expect(window.kiosk!.writeFile).toHaveBeenCalledTimes(1);
  expect(window.kiosk!.makeDirectory).toHaveBeenCalledTimes(1);

  expect(queryAllByTestId('modal')).toHaveLength(1);
  expect(
    queryByText(
      'You may now eject the USB drive. Use the saved ballot package on this USB drive to configure VxScan or VxCentralScan.'
    )
  ).toBeInTheDocument();

  expect(queryByText('Eject USB')).toBeInTheDocument();
  fireEvent.click(getByText('Eject USB'));
  expect(usbDrive.eject).toHaveBeenCalledTimes(1);

  fireEvent.click(getByText('Close'));
  expect(queryAllByTestId('modal')).toHaveLength(0);
});
