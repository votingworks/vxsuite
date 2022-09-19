import { Buffer } from 'buffer';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import pluralize from 'pluralize';
import styled from 'styled-components';
import { join } from 'path';
import { interpretTemplate } from '@votingworks/ballot-interpreter-vx';
import {
  BallotPageLayout,
  BallotType,
  getElectionLocales,
  getPrecinctById,
  HmpbBallotPageMetadata,
} from '@votingworks/types';

import {
  assert,
  generateFilenameForBallotExportPackage,
  BALLOT_PACKAGE_FOLDER,
  usbstick,
  throwIllegalValue,
} from '@votingworks/utils';
import {
  Button,
  Monospace,
  Modal,
  Prose,
  UsbControllerButton,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import { DEFAULT_LOCALE } from '../config/globals';
import { getHumanBallotLanguageFormat } from '../utils/election';
import { pdfToImages } from '../utils/pdf_to_images';

import { AppContext } from '../contexts/app_context';
import { HandMarkedPaperBallot } from './hand_marked_paper_ballot';
import { LinkButton } from './link_button';
import { Loading } from './loading';

import * as workflow from '../workflows/export_election_ballot_package_workflow';
import { BallotMode } from '../config/types';

const { UsbDriveStatus } = usbstick;
const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export function ExportElectionBallotPackageModalButton(): JSX.Element {
  const { electionDefinition, usbDriveStatus, usbDriveEject, auth, logger } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const userRole = auth.user.role;
  const { election, electionData, electionHash } = electionDefinition;
  const electionLocaleCodes = getElectionLocales(election, DEFAULT_LOCALE);

  const [state, setState] = useState<workflow.State>(
    workflow.init(election, electionHash, electionLocaleCodes)
  );

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  /**
   * Execute side effects for the current state and, when ready, transition to
   * the next state.
   */
  useEffect(() => {
    void (async () => {
      switch (state.type) {
        case 'Init': {
          setState(workflow.next);
          break;
        }

        case 'ArchiveEnd': {
          await state.archive.end();
          setState(workflow.next);
          await logger.log(LogEventId.SaveBallotPackageComplete, userRole, {
            disposition: 'success',
            message: 'Finished successfully saving ballot package.',
          });
          break;
        }

        default:
          // nothing to do
          break;
      }
    })();
  }, [state, election, electionData, electionHash, logger, userRole]);

  /**
   * Callback from `HandMarkedPaperBallot` to let us know the preview has been
   * rendered. Once this happens, we generate a PDF and move on to the next one
   * or finish up if that was the last one.
   */
  const onRendered = useCallback(async () => {
    if (state.type !== 'RenderBallot') {
      throw new Error(
        `unexpected state '${state.type}' found during onRendered callback`
      );
    }

    const {
      ballotStyleId,
      precinctId,
      locales,
      isLiveMode,
      filename,
      layoutFilename,
    } = state.currentBallotConfig;
    assert(window.kiosk);
    assert(typeof layoutFilename === 'string');
    const ballotPdfData = Buffer.from(await window.kiosk.printToPDF());
    const layouts: BallotPageLayout[] = [];
    for await (const { page, pageNumber } of pdfToImages(ballotPdfData, {
      scale: 2,
    })) {
      const metadata: HmpbBallotPageMetadata = {
        ballotStyleId,
        electionHash: electionDefinition.electionHash,
        ballotType: BallotType.Standard,
        precinctId,
        locales,
        isTestMode: !isLiveMode,
        pageNumber,
      };
      const { ballotPageLayout } = await interpretTemplate({
        electionDefinition,
        imageData: page,
        metadata,
      });
      layouts.push(ballotPageLayout);
    }
    await state.archive.file(
      layoutFilename,
      JSON.stringify(layouts, undefined, 2)
    );
    await state.archive.file(filename, ballotPdfData);
    setState(workflow.next);
  }, [electionDefinition, state]);

  function closeModal() {
    setIsModalOpen(false);
    setState(workflow.init(election, electionHash, electionLocaleCodes));
  }

  const now = new Date();
  const defaultFileName = generateFilenameForBallotExportPackage(
    electionDefinition,
    now
  );

  // Callback to open the file dialog.
  async function saveFileCallback(openDialog: boolean) {
    assert(state.type === 'ArchiveBegin');
    // TODO(auth) check proper file permissions
    try {
      await logger.log(LogEventId.SaveBallotPackageInit, userRole);
      const usbPath = await usbstick.getDevicePath();
      const pathToFolder = usbPath && join(usbPath, BALLOT_PACKAGE_FOLDER);
      const pathToFile = join(pathToFolder ?? '.', defaultFileName);
      if (openDialog || !pathToFolder) {
        await state.archive.beginWithDialog({
          defaultPath: pathToFile,
          filters: [{ name: 'Archive Files', extensions: ['zip'] }],
        });
      } else {
        await state.archive.beginWithDirectSave(pathToFolder, defaultFileName);
      }
      await state.archive.file('election.json', electionData);
      await state.archive.file(
        'manifest.json',
        JSON.stringify({ ballots: state.ballotConfigs }, undefined, 2)
      );
      setState(workflow.next);
    } catch (error) {
      assert(error instanceof Error);
      setState(workflow.error(state, error));
      await logger.log(LogEventId.SaveBallotPackageComplete, userRole, {
        disposition: 'failure',
        message: `Error saving ballot package: ${error}`,
        result: 'Ballot package not saved, error shown to user.',
      });
    }
  }

  let mainContent: React.ReactNode = null;
  let actions: React.ReactNode = null;

  switch (state.type) {
    case 'Init': {
      mainContent = <Loading />;
      actions = (
        <LinkButton onPress={closeModal} disabled>
          Cancel
        </LinkButton>
      );
      break;
    }

    case 'ArchiveBegin':
      switch (usbDriveStatus) {
        case UsbDriveStatus.absent:
        case UsbDriveStatus.notavailable:
        case UsbDriveStatus.recentlyEjected:
          actions = <LinkButton onPress={closeModal}>Cancel</LinkButton>;
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
                Please insert a USB drive in order to save the ballot
                configuration.
              </p>
            </Prose>
          );
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
          actions = (
            <React.Fragment>
              <Button primary onPress={() => saveFileCallback(false)}>
                Save
              </Button>
              <LinkButton onPress={closeModal}>Cancel</LinkButton>
              <Button onPress={() => saveFileCallback(true)}>Custom</Button>
            </React.Fragment>
          );
          mainContent = (
            <Prose>
              <h1>Save Ballot Package</h1>
              <p>
                <UsbImage src="/assets/usb-drive.svg" alt="Insert USB Image" />A
                zip archive will automatically be saved to the default location
                on the mounted USB drive. Optionally, you may pick a custom save
                location.
              </p>
            </Prose>
          );
          break;
        }

        default:
          throwIllegalValue(usbDriveStatus);
      }
      break;

    case 'RenderBallot': {
      actions = (
        <LinkButton onPress={closeModal} disabled>
          Cancel
        </LinkButton>
      );
      const {
        ballotStyleId,
        precinctId,
        contestIds,
        isLiveMode,
        locales,
        isAbsentee,
      } = state.currentBallotConfig;
      const precinct = getPrecinctById({ election, precinctId });
      assert(precinct);
      const precinctName = precinct.name;

      mainContent = (
        <Prose>
          <h1>
            Generating Ballot{' '}
            {state.ballotConfigsCount - state.remainingBallotConfigs.length} of{' '}
            {state.ballotConfigsCount}…
          </h1>
          <ul>
            <li>
              Ballot Style: <strong>{ballotStyleId}</strong>
            </li>
            <li>
              Precinct: <strong>{precinctName}</strong>
            </li>
            <li>
              Contest count: <strong>{contestIds.length}</strong>
            </li>
            <li>
              Language format:{' '}
              <strong>{getHumanBallotLanguageFormat(locales)}</strong>
            </li>
            <li>
              Filename:{' '}
              <Monospace>{state.currentBallotConfig.filename}</Monospace>
            </li>
          </ul>
          <HandMarkedPaperBallot
            ballotStyleId={ballotStyleId}
            election={election}
            electionHash={electionHash}
            ballotMode={isLiveMode ? BallotMode.Official : BallotMode.Test}
            isAbsentee={isAbsentee}
            precinctId={precinctId}
            onRendered={onRendered}
            locales={locales}
          />
        </Prose>
      );
      break;
    }

    case 'ArchiveEnd': {
      actions = (
        <LinkButton onPress={closeModal} disabled>
          Cancel
        </LinkButton>
      );
      mainContent = (
        <Prose>
          <h1>Saving…</h1>
          <p>
            Rendered {pluralize('ballot', state.ballotConfigsCount, true)},
            closing zip file.
          </p>
        </Prose>
      );
      break;
    }

    case 'Done': {
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
      mainContent = (
        <Prose>
          <h1>Ballot Package Saved</h1>
          <p>
            You may now eject the USB drive. Use the saved ballot package on
            this USB drive to configure VxScan or VxCentralScan.
          </p>
        </Prose>
      );
      break;
    }

    case 'Failed': {
      actions = <LinkButton onPress={closeModal}>Close</LinkButton>;
      mainContent = (
        <Prose>
          <h1>Failed to Save Ballot Package</h1>
          <p>An error occurred: {state.message}.</p>
        </Prose>
      );
      break;
    }

    default:
      // nothing to do
      break;
  }

  return (
    <React.Fragment>
      <LinkButton small onPress={() => setIsModalOpen(true)}>
        Save Ballot Package
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
