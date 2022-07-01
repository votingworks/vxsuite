import React, { useState, useCallback, useEffect, useContext } from 'react';
import { join } from 'path';

import styled from 'styled-components';
import {
  assert,
  parseBallotExportPackageInfoFromFilename,
  BALLOT_PACKAGE_FOLDER,
  usbstick,
  ElectionData,
} from '@votingworks/utils';
import {
  isAdminAuth,
  Main,
  Screen,
  Text,
  UsbControllerButton,
} from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import { Prose } from './prose';
import { MainNav } from './main_nav';
import { Loading } from './loading';
import { FileInputButton } from './file_input_button';
import { AppContext } from '../contexts/app_context';

import { Button } from './button';
import { Table, TD } from './table';

const Image = styled.img`
  float: right;
  max-width: 300px;
  margin-top: -35px;
  margin-left: -10px;
`;

const ListItem = styled.li`
  margin: 0 0 10px 0;
`;

const Title = styled.span`
  text-transform: capitalize;
`;

export interface Props {
  acceptManuallyChosenFile(file: File): Promise<void>;
  acceptAutomaticallyChosenFile(
    file: KioskBrowser.FileSystemEntry
  ): Promise<void>;
}

export function ElectionConfiguration({
  acceptAutomaticallyChosenFile: acceptAutomaticallyChosenFileFromProps,
  acceptManuallyChosenFile: acceptManuallyChosenFileFromProps,
}: Props): JSX.Element {
  const [foundFilenames, setFoundFilenames] = useState<
    KioskBrowser.FileSystemEntry[]
  >([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { usbDriveStatus, usbDriveEject, logger, auth } =
    useContext(AppContext);
  assert(isAdminAuth(auth));
  const userRole = auth.user.role;

  async function acceptAutomaticallyChosenFile(
    file: KioskBrowser.FileSystemEntry
  ) {
    try {
      await acceptAutomaticallyChosenFileFromProps(file);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      }
    }
  }

  async function acceptManuallyChosenFile(file: File) {
    try {
      await acceptManuallyChosenFileFromProps(file);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      }
    }
  }

  const fetchFilenames = useCallback(async () => {
    setLoadingFiles(true);
    const usbPath = await usbstick.getDevicePath();
    try {
      assert(typeof usbPath !== 'undefined');
      assert(window.kiosk);
      const files = await window.kiosk.getFileSystemEntries(
        join(usbPath, BALLOT_PACKAGE_FOLDER)
      );
      const newFoundFilenames = files.filter(
        (f) => f.type === 1 && f.name.endsWith('.zip')
      );
      setFoundFilenames(newFoundFilenames);
      await logger.log(LogEventId.BallotPackageFilesReadFromUsb, userRole, {
        disposition: 'success',
        message: `Automatically found ${newFoundFilenames.length} ballot package files to import to machine. User prompted to select one to import.`,
      });
      setLoadingFiles(false);
    } catch (err) {
      if (err instanceof Error && err.message.includes('ENOENT')) {
        // The directory on the usb drive was not found. Treat this the same
        // as finding no matching zip files.
        setFoundFilenames([]);
        setLoadingFiles(false);
        await logger.log(LogEventId.BallotPackageFilesReadFromUsb, userRole, {
          disposition: 'success',
          message: `Automatically found 0 ballot package files to import to machine. User prompted to select file manually to import.`,
        });
      } else if (err instanceof Error) {
        await logger.log(LogEventId.BallotPackageFilesReadFromUsb, userRole, {
          disposition: 'failure',
          message: `Error searching USB for ballot packages.`,
          error: err.message,
          result: 'User shown error.',
        });
        throw err;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFoundFilenames, setLoadingFiles, usbDriveStatus, logger, userRole]);

  useEffect(() => {
    if (usbDriveStatus === usbstick.UsbDriveStatus.mounted) {
      void fetchFilenames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usbDriveStatus]);

  async function handleFileInput(event: React.FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    if (file) {
      await acceptManuallyChosenFile(file);
    }
  }

  const mainNav = (
    <MainNav isTestMode={false}>
      <Button small onPress={() => auth.logOut()}>
        Lock Machine
      </Button>
      <UsbControllerButton
        usbDriveEject={() => usbDriveEject(userRole)}
        usbDriveStatus={usbDriveStatus}
      />
    </MainNav>
  );

  if (
    usbDriveStatus === usbstick.UsbDriveStatus.present ||
    usbDriveStatus === usbstick.UsbDriveStatus.ejecting ||
    loadingFiles
  ) {
    return (
      <Screen>
        <Main centerChild>
          <Loading />
        </Main>
        {mainNav}
      </Screen>
    );
  }

  if (usbDriveStatus === usbstick.UsbDriveStatus.mounted && !loadingFiles) {
    // Parse information from the file names and sort by export date.
    const parsedFileInformation = foundFilenames
      .map((f) => {
        return {
          parsedInfo: parseBallotExportPackageInfoFromFilename(f.name),
          fileEntry: f,
        };
      })
      .filter(
        (
          f
        ): f is {
          parsedInfo: ElectionData;
          fileEntry: KioskBrowser.FileSystemEntry;
        } => !!f.parsedInfo
      )
      .sort(
        (a, b) =>
          b.parsedInfo.timestamp.getTime() - a.parsedInfo.timestamp.getTime()
      );

    // Create table rows for each found file
    const fileOptions = [];
    for (const { parsedInfo, fileEntry } of parsedFileInformation) {
      const { electionCounty, electionName, electionHash, timestamp } =
        parsedInfo;
      fileOptions.push(
        <tr key={fileEntry.name} data-testid="table-row">
          <td>{timestamp.toLocaleString()}</td>
          <td>
            <Title>{electionCounty}</Title>
          </td>
          <td>
            <Title>{electionName}</Title>
          </td>
          <td>{electionHash}</td>
          <TD textAlign="right">
            <Button
              primary
              onPress={() => acceptAutomaticallyChosenFile(fileEntry)}
            >
              Select
            </Button>
          </TD>
        </tr>
      );
    }

    // If there were no valid files found prompt the user to select a file themselves.
    if (fileOptions.length === 0) {
      return (
        <Screen>
          <Main padded>
            <Prose>
              <h1>No Election Ballot Package Files Found</h1>
              <Image src="/assets/usb-drive.svg" alt="Insert USB Image" />
              <Text>
                There were no Election Ballot Package files automatically found
                on the inserted USB drive. Use VxAdmin to export Ballot Package
                files to this USB drive.
              </Text>
              <Text>
                Optionally, you may manually select a file to configure:
              </Text>
              <FileInputButton
                accept=".json,.zip"
                onChange={handleFileInput}
                data-testid="manual-upload-input"
              >
                Select File…
              </FileInputButton>
            </Prose>
          </Main>
          {mainNav}
        </Screen>
      );
    }

    return (
      <Screen>
        <Main padded>
          <Prose maxWidth={false}>
            <h1>Choose Election Configuration</h1>
            <Text>
              Select one of the following configurations which were
              automatically found on the USB drive. If you don&apos;t see the
              file you are looking for, you may select a configuration file
              manually.
            </Text>
            {errorMessage !== '' && (
              <Text error>
                An error occurred while importing the election configuration:{' '}
                {errorMessage}. Please check the file you are importing and try
                again.
              </Text>
            )}
            <Table>
              <thead>
                <tr>
                  <th>Export Date</th>
                  <th>County</th>
                  <th>Election Name</th>
                  <th>ID</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fileOptions}
                <tr>
                  <td />
                  <td />
                  <td />
                  <td />
                  <TD textAlign="right">
                    <FileInputButton
                      accept=".json,.zip"
                      onChange={handleFileInput}
                      data-testid="manual-upload-input"
                    >
                      Select File…
                    </FileInputButton>
                  </TD>
                </tr>
              </tbody>
            </Table>
          </Prose>
        </Main>
        {mainNav}
      </Screen>
    );
  }

  // No USB Drive was found show initial screen.
  return (
    <Screen>
      <Main padded centerChild>
        <Prose maxWidth={false}>
          <h1>Load Election Configuration</h1>
          <Image src="/assets/usb-drive.svg" alt="Insert USB Image" />
          <p>You may load via the following methods:</p>
          <ul>
            <ListItem>
              <strong>Insert a USB drive</strong> with election ballot packages
              exported from VxAdmin.
            </ListItem>
            <ListItem>
              Manually select a file to configure:{' '}
              <FileInputButton
                accept=".json,.zip"
                onChange={handleFileInput}
                data-testid="manual-upload-input"
                buttonProps={{ small: true }}
              >
                Select File…
              </FileInputButton>
            </ListItem>
          </ul>
        </Prose>
      </Main>
      {mainNav}
    </Screen>
  );
}
