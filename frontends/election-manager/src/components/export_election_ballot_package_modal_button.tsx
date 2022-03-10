import React, { useContext, useEffect, useState } from 'react';
import pluralize from 'pluralize';
import styled from 'styled-components';
import { join } from 'path';
import { getElectionLocales, getPrecinctById } from '@votingworks/types';

import {
  assert,
  generateFilenameForBallotExportPackage,
  BALLOT_PACKAGE_FOLDER,
  usbstick,
  throwIllegalValue,
} from '@votingworks/utils';
import { UsbControllerButton, Modal } from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import { DEFAULT_LOCALE } from '../config/globals';
import { getHumanBallotLanguageFormat } from '../utils/election';

import { AppContext } from '../contexts/app_context';
import { HandMarkedPaperBallot } from './hand_marked_paper_ballot';
import { Button } from './button';
import { Prose } from './prose';
import { LinkButton } from './link_button';
import { Loading } from './loading';
import { Monospace } from './text';

import * as workflow from '../workflows/export_election_ballot_package_workflow';

const { UsbDriveStatus } = usbstick;
const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export function ExportElectionBallotPackageModalButton(): JSX.Element {
  const {
    electionDefinition,
    usbDriveStatus,
    usbDriveEject,
    currentUserSession,
    logger,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(currentUserSession); // TODO(auth) should this make sure we have an admin
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
          await logger.log(
            LogEventId.ExportBallotPackageComplete,
            currentUserSession.type,
            {
              disposition: 'success',
              message: 'Finished successfully exporting ballot package.',
            }
          );
          break;
        }

        default:
          // nothing to do
          break;
      }
    })();
  }, [state, election, electionData, electionHash, logger, currentUserSession]);

  /**
   * Callback from `HandMarkedPaperBallot` to let us know the preview has been
   * rendered. Once this happens, we generate a PDF and move on to the next one
   * or finish up if that was the last one.
   */
  // const onRendered = useCallback(async () => {
  //   if (state.type !== 'RenderBallot') {
  //     throw new Error(
  //       `unexpected state '${state.type}' found during onRendered callback`
  //     );
  //   }

  //   const {
  //     ballotStyleId,
  //     precinctId,
  //     locales,
  //     isLiveMode,
  //     isAbsentee,
  //   } = state.currentBallotConfig;
  //   const path = getBallotPath({
  //     ballotStyleId,
  //     election,
  //     electionHash,
  //     precinctId,
  //     locales,
  //     isLiveMode,
  //     isAbsentee,
  //   });
  //   assert(window.kiosk);
  //   const data = await window.kiosk.printToPDF();
  //   await state.archive.file(path, Buffer.from(data));
  //   setState(workflow.next);
  // }, [election, electionHash, state]);

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
    assert(currentUserSession); // TODO(auth) check proper file permissions
    try {
      await logger.log(
        LogEventId.ExportBallotPackageInit,
        currentUserSession.type
      );
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
      setState(workflow.error(state, error));
      await logger.log(
        LogEventId.ExportBallotPackageComplete,
        currentUserSession.type,
        {
          disposition: 'failure',
          message: `Error exporting ballot package: ${error}`,
          result: 'Ballot package not exported, error shown to user.',
        }
      );
    }
  }

  let mainContent = null;
  let actions = null;

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
                  src="usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to export with file dialog by double-clicking
                  onDoubleClick={() => saveFileCallback(true)}
                />
                Please insert a USB drive in order to export the ballot
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
                Export
              </Button>
              <LinkButton onPress={closeModal}>Cancel</LinkButton>
              <Button onPress={() => saveFileCallback(true)}>Custom</Button>
            </React.Fragment>
          );
          mainContent = (
            <Prose>
              <h1>Export Ballot Package</h1>
              <p>
                <UsbImage src="usb-drive.svg" alt="Insert USB Image" />A zip
                archive will automatically be saved to the default location on
                the mounted USB drive. Optionally, you may pick a custom export
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
            isLiveMode={isLiveMode}
            isAbsentee={isAbsentee}
            precinctId={precinctId}
            // onRendered={onRendered}
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
          <h1>Finishing Download…</h1>
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
              usbDriveEject={() => usbDriveEject(currentUserSession.type)}
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
          <h1>Download Complete</h1>
          <p>
            You may now eject the USB drive. Use the exported ballot package on
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
          <h1>Download Failed</h1>
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
        Export Ballot Package
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
