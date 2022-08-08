import { Buffer } from 'buffer';
import React, { useCallback, useContext, useState, useMemo } from 'react';
import styled from 'styled-components';
import { join } from 'path';
import { BallotLocales } from '@votingworks/types';

import {
  assert,
  usbstick,
  throwIllegalValue,
  BallotStyleData,
  BALLOT_PDFS_FOLDER,
} from '@votingworks/utils';
import {
  Modal,
  Prose,
  UsbControllerButton,
  isAdminAuth,
  isSuperadminAuth,
} from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import {
  getBallotArchiveFilename,
  getBallotPath,
  getBallotStylesData,
  sortBallotStyleDataByPrecinct,
} from '../utils/election';

import { AppContext } from '../contexts/app_context';
import { HandMarkedPaperBallot } from './hand_marked_paper_ballot';
import { Button } from './button';
import { LinkButton } from './link_button';
import { Loading } from './loading';

import { BallotMode } from '../config/types';
import { DownloadableArchive } from '../utils/downloadable_archive';
import { BallotTypeToggle } from './ballot_type_toggle';
import { BallotModeToggle } from './ballot_mode_toggle';
import { PrintableArea } from './printable_area';
import { DEFAULT_LOCALE } from '../config/globals';
import { generatePdfExportMetadataCsv } from '../utils/generate_pdf_export_metadata_csv';

const { UsbDriveStatus } = usbstick;
const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

const CenteredOptions = styled.div`
  text-align: center;
`;

type ModalState =
  | 'BeforeExport'
  | 'GeneratingFiles'
  | 'FinishingExport'
  | 'Done'
  | 'Error';

const defaultBallotLocales: BallotLocales = { primary: DEFAULT_LOCALE };

export function ExportBallotPdfsButton(): JSX.Element {
  const { electionDefinition, usbDriveStatus, usbDriveEject, auth, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isAdminAuth(auth) || isSuperadminAuth(auth));
  const userRole = auth.user.role;
  const { election, electionHash } = electionDefinition;

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalState, setModalState] = useState<ModalState>('BeforeExport');
  const [modalError, setModalError] = useState<Error>();
  const [archive, setArchive] = useState(new DownloadableArchive());
  const [ballotMode, setBallotMode] = useState(BallotMode.Official);
  const [isAbsentee, setIsAbsentee] = useState(false);
  const [ballotIndex, setBallotIndex] = useState(0);

  const defaultArchiveFilename = getBallotArchiveFilename(
    electionHash,
    ballotMode,
    isAbsentee
  );

  const ballotStyleList = useMemo<BallotStyleData[]>(() => {
    return sortBallotStyleDataByPrecinct(
      election,
      getBallotStylesData(election)
    );
  }, [election]);

  const ballotStyle = ballotStyleList[ballotIndex];
  const ballotFilename = getBallotPath({
    ballotStyleId: ballotStyle.ballotStyleId,
    precinctId: ballotStyle.precinctId,
    ballotMode,
    isAbsentee,
    election,
    electionHash,
    locales: defaultBallotLocales,
  });

  const doFileMetadata = useCallback(async () => {
    const pdfExportMetadataCsv = generatePdfExportMetadataCsv({
      electionDefinition,
      ballotMode,
      isAbsentee,
      ballotLocales: defaultBallotLocales,
    });
    await archive.file(
      `${defaultArchiveFilename}-metadata.csv`,
      pdfExportMetadataCsv
    );
  }, [
    archive,
    ballotMode,
    defaultArchiveFilename,
    electionDefinition,
    isAbsentee,
  ]);

  const endExport = useCallback(async () => {
    setModalState('FinishingExport');
    await doFileMetadata();
    await archive.end();
    setModalState('Done');
    await logger.log(LogEventId.FileSaved, userRole, {
      disposition: 'success',
      message: `Successfully saved ${defaultArchiveFilename}.zip to the usb drive.`,
    });
  }, [doFileMetadata, archive, logger, userRole, defaultArchiveFilename]);

  const onRendered = useCallback(async () => {
    assert(window.kiosk);
    const ballotPdfData = Buffer.from(await window.kiosk.printToPDF());
    await archive.file(ballotFilename, ballotPdfData);

    if (ballotIndex + 1 === ballotStyleList.length) {
      await endExport();
    } else {
      setBallotIndex(ballotIndex + 1);
    }
  }, [archive, ballotIndex, ballotStyleList, ballotFilename, endExport]);

  function closeModal() {
    setIsModalOpen(false);
    setModalState('BeforeExport');
    setModalError(undefined);
    setArchive(new DownloadableArchive());
    setBallotIndex(0);
  }

  // Callback to open the file dialog.
  async function saveFileCallback(openDialog: boolean) {
    try {
      const usbPath = await usbstick.getDevicePath();
      const pathToFolder = usbPath && join(usbPath, BALLOT_PDFS_FOLDER);
      const defaultArchiveFilenameWithExtension = `${defaultArchiveFilename}.zip`;
      const pathToFile = join(
        pathToFolder ?? '.',
        defaultArchiveFilenameWithExtension
      );
      if (openDialog || !pathToFolder) {
        await archive.beginWithDialog({
          defaultPath: pathToFile,
          filters: [{ name: 'Archive Files', extensions: ['zip'] }],
        });
      } else {
        await archive.beginWithDirectSave(
          pathToFolder,
          defaultArchiveFilenameWithExtension
        );
      }
      setModalState('GeneratingFiles');
    } catch (error) {
      assert(error instanceof Error);
      setModalState('Error');
      setModalError(error);
      await logger.log(LogEventId.FileSaved, userRole, {
        disposition: 'failure',
        message: `Error exporting ballot PDFs: ${error}`,
        result: 'Ballot PDFs not exported, error shown to user.',
      });
    }
  }

  let mainContent = null;
  let actions = null;

  switch (modalState) {
    case 'BeforeExport':
      switch (usbDriveStatus) {
        case UsbDriveStatus.absent:
        case UsbDriveStatus.notavailable:
        case UsbDriveStatus.recentlyEjected:
          mainContent = (
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <UsbImage
                  src="/assets/usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to export with file dialog by double-clicking
                  onDoubleClick={() => saveFileCallback(true)}
                />
                Please insert a USB drive in order to export the ballot PDF
                archive.
              </p>
            </Prose>
          );
          actions = <LinkButton onPress={closeModal}>Cancel</LinkButton>;
          break;
        case UsbDriveStatus.ejecting:
        case UsbDriveStatus.present:
          mainContent = <Loading />;
          actions = (
            <LinkButton onPress={closeModal} disabled>
              Cancel
            </LinkButton>
          );
          break;
        case UsbDriveStatus.mounted: {
          mainContent = (
            <Prose>
              <h1>Save Ballot PDFs</h1>
              <p>
                The export will include a PDF for each ballot style of the
                current election. Select the type of ballots you would like to
                export:
              </p>
              <CenteredOptions>
                <p>
                  <BallotModeToggle
                    ballotMode={ballotMode}
                    setBallotMode={setBallotMode}
                  />
                </p>
                <p>
                  <BallotTypeToggle
                    isAbsentee={isAbsentee}
                    setIsAbsentee={setIsAbsentee}
                    absenteeFirst={false}
                  />
                </p>
              </CenteredOptions>
              <p>
                A zip archive will automatically be saved to the default
                location on the mounted USB drive. Optionally, you may pick a
                custom export location.
              </p>
            </Prose>
          );
          actions = (
            <React.Fragment>
              <Button primary onPress={() => saveFileCallback(false)}>
                Export
              </Button>
              <LinkButton onPress={closeModal}>Cancel</LinkButton>
              <Button onPress={() => saveFileCallback(true)}>Custom</Button>
            </React.Fragment>
          );
          break;
        }

        default:
          throwIllegalValue(usbDriveStatus);
      }
      break;

    case 'GeneratingFiles': {
      mainContent = (
        <React.Fragment>
          <Prose textCenter>
            <h1>
              <strong>Generating Ballot PDFs…</strong>
            </h1>
          </Prose>
          <PrintableArea>
            <HandMarkedPaperBallot
              ballotStyleId={ballotStyle.ballotStyleId}
              election={election}
              electionHash={electionHash}
              ballotMode={ballotMode}
              isAbsentee={isAbsentee}
              precinctId={ballotStyle.precinctId}
              onRendered={onRendered}
              locales={defaultBallotLocales}
            />
          </PrintableArea>
        </React.Fragment>
      );
      break;
    }

    case 'FinishingExport': {
      mainContent = (
        <Prose textCenter>
          <h1>
            <strong>Finishing Export…</strong>
          </h1>
        </Prose>
      );
      break;
    }

    case 'Done': {
      mainContent = (
        <Prose>
          <h1>Export Complete</h1>
          <p>You may now eject the USB drive.</p>
        </Prose>
      );
      if (usbDriveStatus !== UsbDriveStatus.recentlyEjected) {
        actions = (
          <React.Fragment>
            <UsbControllerButton
              primary
              small={false}
              usbDriveEject={() => usbDriveEject(userRole)}
              usbDriveStatus={usbDriveStatus}
            />
            <LinkButton onPress={closeModal}>Close</LinkButton>
          </React.Fragment>
        );
      } else {
        actions = <LinkButton onPress={closeModal}>Close</LinkButton>;
      }
      break;
    }

    case 'Error': {
      mainContent = (
        <Prose>
          <h1>Export Failed</h1>
          <p>An error occurred: {modalError && modalError.message}.</p>
        </Prose>
      );
      actions = <LinkButton onPress={closeModal}>Close</LinkButton>;
      break;
    }

    default:
      throwIllegalValue(modalState);
  }

  return (
    <React.Fragment>
      <LinkButton small onPress={() => setIsModalOpen(true)}>
        Save PDFs
      </LinkButton>
      {isModalOpen && (
        <Modal
          content={mainContent}
          onOverlayClick={closeModal}
          actions={actions}
        />
      )}
    </React.Fragment>
  );
}
