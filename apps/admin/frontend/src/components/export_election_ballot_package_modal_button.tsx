import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { join } from 'path';
import {
  generateFilenameForBallotExportPackage,
  BALLOT_PACKAGE_FOLDER,
  usbstick,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { Button, Modal, Prose, UsbControllerButton } from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import { getSystemSettings } from '../api';

import { AppContext } from '../contexts/app_context';
import { Loading } from './loading';

import * as workflow from '../workflows/export_election_ballot_package_workflow';

const UsbImage = styled.img`
  margin-right: auto;
  margin-left: auto;
  height: 200px;
`;

export function ExportElectionBallotPackageModalButton(): JSX.Element {
  const { electionDefinition, usbDrive, auth, logger } = useContext(AppContext);
  assert(electionDefinition);
  const systemSettingsQuery = getSystemSettings.useQuery();
  const systemSettings = systemSettingsQuery.data;
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const userRole = auth.user.role;
  const { election, electionData, electionHash } = electionDefinition;

  const [state, setState] = useState<workflow.State>(
    workflow.init(electionDefinition)
  );

  const loaded = systemSettingsQuery.isSuccess;

  const [isModalOpen, setIsModalOpen] = useState(false);

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

  function closeModal() {
    setIsModalOpen(false);
    assert(electionDefinition);
    setState(workflow.init(electionDefinition));
  }

  const now = new Date();
  const defaultFileName = generateFilenameForBallotExportPackage(
    electionDefinition,
    now
  );

  // Callback to open the file dialog.
  async function saveFileCallback(openDialog: boolean) {
    assert(state.type === 'ArchiveBegin');
    assert(systemSettings !== undefined);
    // TODO(auth) check proper file permissions
    try {
      await logger.log(LogEventId.SaveBallotPackageInit, userRole);
      const usbPath = await usbstick.getPath();
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
        'systemSettings.json',
        JSON.stringify(systemSettings, null, 2)
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
        <Button onPress={closeModal} disabled>
          Cancel
        </Button>
      );
      break;
    }

    case 'ArchiveBegin':
      switch (usbDrive.status) {
        case 'absent':
        case 'ejected':
        case 'bad_format':
          actions = <Button onPress={closeModal}>Cancel</Button>;
          mainContent = (
            <Prose>
              <h1>No USB Drive Detected</h1>
              <p>
                <UsbImage
                  src="/assets/usb-drive.svg"
                  alt="Insert USB Image"
                  // hidden feature to save with file dialog by double-clicking
                  onDoubleClick={
                    loaded ? () => saveFileCallback(true) : undefined
                  }
                />
                Please insert a USB drive in order to save the ballot
                configuration.
              </p>
            </Prose>
          );
          break;
        case 'ejecting':
        case 'mounting':
          mainContent = <Loading />;
          actions = (
            <Button onPress={closeModal} disabled>
              Cancel
            </Button>
          );
          break;
        case 'mounted': {
          actions = (
            <React.Fragment>
              <Button
                disabled={!loaded}
                variant="primary"
                onPress={() => saveFileCallback(false)}
              >
                {loaded ? 'Save' : 'Loading …'}
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
              <Button disabled={!loaded} onPress={() => saveFileCallback(true)}>
                Custom
              </Button>
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
          throwIllegalValue(usbDrive.status);
      }
      break;

    case 'ArchiveEnd': {
      actions = (
        <Button onPress={closeModal} disabled>
          Cancel
        </Button>
      );
      mainContent = (
        <Prose>
          <h1>Saving…</h1>
          <p>Closing zip file.</p>
        </Prose>
      );
      break;
    }

    case 'Done': {
      if (usbDrive.status !== 'ejected') {
        actions = (
          <React.Fragment>
            <UsbControllerButton
              primary
              small={false}
              usbDriveEject={() => usbDrive.eject(userRole)}
              usbDriveStatus={usbDrive.status}
            />
            <Button onPress={closeModal}>Close</Button>
          </React.Fragment>
        );
      } else {
        actions = <Button onPress={closeModal}>Close</Button>;
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
      actions = <Button onPress={closeModal}>Close</Button>;
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
      <Button small onPress={() => setIsModalOpen(true)}>
        Save Ballot Package
      </Button>
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
