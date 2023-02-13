import { Buffer } from 'buffer';
import React, { useCallback, useContext, useState, useMemo } from 'react';
import styled from 'styled-components';
import { join } from 'path';
import { BallotLocale } from '@votingworks/types';

import { Admin } from '@votingworks/api';
import {
  usbstick,
  BallotStyleData,
  BALLOT_PDFS_FOLDER,
} from '@votingworks/shared';
import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  Button,
  Modal,
  Prose,
  UsbControllerButton,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  printElementToPdfWhenReady,
} from '@votingworks/shared-frontend';
import { LogEventId } from '@votingworks/logging';
import {
  getBallotArchiveFilename,
  getBallotPath,
  getBallotStylesData,
  sortBallotStyleDataByPrecinct,
} from '../utils/election';

import { AppContext } from '../contexts/app_context';
import { HandMarkedPaperBallot } from './hand_marked_paper_ballot';
import { LinkButton } from './link_button';
import { Loading } from './loading';

import { DownloadableArchive } from '../utils/downloadable_archive';
import { BallotTypeToggle } from './ballot_type_toggle';
import { BallotModeToggle } from './ballot_mode_toggle';
import { DEFAULT_LOCALE } from '../config/globals';
import { generatePdfExportMetadataCsv } from '../utils/generate_pdf_export_metadata_csv';

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

const defaultBallotLocales: BallotLocale = { primary: DEFAULT_LOCALE };

export function ExportBallotPdfsButton(): JSX.Element {
  const { electionDefinition, usbDrive, auth, logger } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const userRole = auth.user.role;
  const { election, electionHash } = electionDefinition;

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalState, setModalState] = useState<ModalState>('BeforeExport');
  const [modalError, setModalError] = useState<Error>();
  const [archive, setArchive] = useState(new DownloadableArchive());
  const [ballotMode, setBallotMode] = useState(Admin.BallotMode.Official);
  const [isAbsentee, setIsAbsentee] = useState(false);

  const defaultArchiveFilename = getBallotArchiveFilename(
    electionDefinition,
    ballotMode,
    isAbsentee
  );

  const ballotStyleList = useMemo<BallotStyleData[]>(() => {
    return sortBallotStyleDataByPrecinct(
      election,
      getBallotStylesData(election)
    );
  }, [election]);

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

  async function exportBallotStyle(ballotStyle: BallotStyleData) {
    const { ballotStyleId, precinctId } = ballotStyle;
    assert(electionDefinition);
    const ballotFilename = getBallotPath({
      ballotStyleId: ballotStyle.ballotStyleId,
      precinctId: ballotStyle.precinctId,
      ballotMode,
      isAbsentee,
      electionDefinition,
      locales: defaultBallotLocales,
    });

    const ballotPdfData = Buffer.from(
      await printElementToPdfWhenReady((onRendered) => {
        return (
          <HandMarkedPaperBallot
            ballotStyleId={ballotStyleId}
            election={election}
            electionHash={electionHash}
            ballotMode={ballotMode}
            isAbsentee={isAbsentee}
            precinctId={precinctId}
            onRendered={onRendered}
            locales={defaultBallotLocales}
          />
        );
      })
    );

    await archive.file(ballotFilename, ballotPdfData);
  }

  async function exportAllBallotStyles() {
    for (const ballotStyle of ballotStyleList) {
      await exportBallotStyle(ballotStyle);
    }
    await endExport();
  }

  function closeModal() {
    setIsModalOpen(false);
    setModalState('BeforeExport');
    setModalError(undefined);
    setArchive(new DownloadableArchive());
  }

  // Callback to open the file dialog.
  async function saveFileCallback(openDialog: boolean) {
    try {
      const usbPath = await usbstick.getPath();
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
      await exportAllBallotStyles();
    } catch (error) {
      assert(error instanceof Error);
      setModalState('Error');
      setModalError(error);
      await logger.log(LogEventId.FileSaved, userRole, {
        disposition: 'failure',
        message: `Error saving ballot PDFs: ${error}`,
        result: 'Ballot PDFs not saved, error shown to user.',
      });
    }
  }

  let mainContent: React.ReactNode = null;
  let actions: React.ReactNode = null;

  switch (modalState) {
    case 'BeforeExport':
      switch (usbDrive.status) {
        case 'absent':
        case 'ejected':
        case 'bad_format':
          mainContent = (
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <UsbImage
                  src="/assets/usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to save with file dialog by double-clicking
                  onDoubleClick={() => saveFileCallback(true)}
                />
                Please insert a USB drive in order to save the ballot PDF
                archive.
              </p>
            </Prose>
          );
          actions = <LinkButton onPress={closeModal}>Cancel</LinkButton>;
          break;
        case 'ejecting':
        case 'mounting':
          mainContent = <Loading />;
          actions = (
            <LinkButton onPress={closeModal} disabled>
              Cancel
            </LinkButton>
          );
          break;
        case 'mounted': {
          mainContent = (
            <Prose>
              <h1>Save Ballot PDFs</h1>
              <p>
                The saved zip file will include a PDF for each ballot style of
                the current election. Select the type of ballots you would like
                to save:
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
                custom save location.
              </p>
            </Prose>
          );
          actions = (
            <React.Fragment>
              <Button primary onPress={() => saveFileCallback(false)}>
                Save
              </Button>
              <LinkButton onPress={closeModal}>Cancel</LinkButton>
              <Button onPress={() => saveFileCallback(true)}>Custom</Button>
            </React.Fragment>
          );
          break;
        }

        default:
          throwIllegalValue(usbDrive.status);
      }
      break;

    case 'GeneratingFiles': {
      mainContent = (
        <Prose textCenter>
          <h1>
            <strong>Generating Ballot PDFs…</strong>
          </h1>
        </Prose>
      );
      break;
    }

    case 'FinishingExport': {
      mainContent = (
        <Prose textCenter>
          <h1>
            <strong>Saving…</strong>
          </h1>
        </Prose>
      );
      break;
    }

    case 'Done': {
      mainContent = (
        <Prose>
          <h1>Ballot PDFs Saved</h1>
          <p>You may now eject the USB drive.</p>
        </Prose>
      );
      if (usbDrive.status !== 'ejected') {
        actions = (
          <React.Fragment>
            <UsbControllerButton
              primary
              small={false}
              usbDriveEject={() => usbDrive.eject(userRole)}
              usbDriveStatus={usbDrive.status}
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
          <h1>Failed to Save Ballot PDFs</h1>
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
