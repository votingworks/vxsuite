import React, { useEffect, useState, useCallback } from 'react'
import path from 'path'

import styled from 'styled-components'
import Prose from './Prose'
import Main, { MainChild } from './Main'
import MainNav from './MainNav'
import Screen from './Screen'
import Text from './Text'
import Loading from './Loading'
import FileInputButton from './FileInputButton'

import USBControllerButton from './USBControllerButton'
import { UsbDriveStatus, getDevicePath } from '../lib/usbstick'
import {
  parseBallotExportPackageInfoFromFilename,
  BALLOT_PACKAGE_FOLDER,
} from '../util/filenames'
import Button from './Button'
import Table, { TD } from './Table'

const Image = styled.img`
  float: right;
  max-width: 300px;
  margin-top: -35px;
  margin-left: -10px;
`

const ListItem = styled.li`
  margin: 0 0 10px 0;
`

const Title = styled.span`
  text-transform: capitalize;
`

export interface Props {
  acceptManuallyChosenFile(file: File): void
  acceptAutomaticallyChosenFile(file: KioskBrowser.FileSystemEntry): void
  usbDriveStatus: UsbDriveStatus
}

const ElectionConfiguration: React.FC<Props> = ({
  acceptAutomaticallyChosenFile: acceptAutomaticallyChosenFileFromProps,
  acceptManuallyChosenFile: acceptManuallyChosenFileFromProps,
  usbDriveStatus,
}) => {
  const [foundFilenames, setFoundFilenames] = useState<
    KioskBrowser.FileSystemEntry[]
  >([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const acceptAutomaticallyChosenFile = async (
    file: KioskBrowser.FileSystemEntry
  ) => {
    try {
      await acceptAutomaticallyChosenFileFromProps(file)
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  const acceptManuallyChosenFile = async (file: File) => {
    try {
      await acceptManuallyChosenFileFromProps(file)
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  const fetchFilenames = useCallback(async () => {
    setLoadingFiles(true)
    const usbPath = await getDevicePath()
    try {
      const files = await window.kiosk!.getFileSystemEntries(
        path.join(usbPath!, BALLOT_PACKAGE_FOLDER)
      )
      setFoundFilenames(
        files.filter((f) => f.type === 1 && f.name.endsWith('.zip'))
      )
      setLoadingFiles(false)
    } catch (err) {
      if (err.message.includes('ENOENT')) {
        // The directory on the usb drive was not found. Treat this the same
        // as finding no matching zip files.
        setFoundFilenames([])
        setLoadingFiles(false)
      } else {
        throw err
      }
    }
  }, [setFoundFilenames, setLoadingFiles, usbDriveStatus])

  useEffect(() => {
    if (usbDriveStatus === UsbDriveStatus.mounted) {
      fetchFilenames()
    }
  }, [usbDriveStatus])

  const handleFileInput = async (event: React.FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files && input.files[0]
    if (file) {
      acceptManuallyChosenFile(file)
    }
  }

  const mainNav = (
    <MainNav isTestMode={false}>
      <USBControllerButton />
    </MainNav>
  )

  if (
    usbDriveStatus === UsbDriveStatus.present ||
    usbDriveStatus === UsbDriveStatus.ejecting ||
    loadingFiles
  ) {
    return (
      <Screen>
        <Main noPadding>
          <MainChild center padded>
            <Loading />
          </MainChild>
        </Main>
        {mainNav}
      </Screen>
    )
  }

  if (usbDriveStatus === UsbDriveStatus.mounted && !loadingFiles) {
    // Parse information from the file names and sort by export date.
    const parsedFileInformation = foundFilenames
      .map((f) => {
        return {
          parsedInfo: parseBallotExportPackageInfoFromFilename(f.name),
          fileEntry: f,
        }
      })
      .filter((f) => !!f.parsedInfo)
      .sort(
        (a, b) =>
          b.parsedInfo!.timestamp.getTime() - a.parsedInfo!.timestamp.getTime()
      )

    // Create table rows for each found file
    const fileOptions = []
    for (const { parsedInfo, fileEntry } of parsedFileInformation) {
      const {
        electionCounty,
        electionName,
        electionHash,
        timestamp,
      } = parsedInfo!
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
      )
    }

    // If there were no valid files found prompt the user to select a file themselves.
    if (fileOptions.length === 0) {
      return (
        <Screen>
          <Main>
            <MainChild center padded>
              <Prose>
                <h1>No Election Ballot Package Files Found</h1>
                <Image src="usb-stick.svg" alt="Insert USB Image" />
                <Text>
                  There were no Election Ballot Package files automatically
                  found on the inserted USB drive. Use Election Manager to
                  export Ballot Package files to this USB drive.
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
            </MainChild>
          </Main>
          {mainNav}
        </Screen>
      )
    }

    return (
      <Screen>
        <Main>
          <MainChild padded maxWidth={false}>
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
                  An error occured while importing the election configuration:{' '}
                  {errorMessage}. Please check the file you are importing and
                  try again.
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
          </MainChild>
        </Main>
        {mainNav}
      </Screen>
    )
  }

  // No USB Drive was found show initial screen.
  return (
    <Screen>
      <Main>
        <MainChild center padded>
          <Prose maxWidth={false}>
            <h1>Load Election Configuration</h1>
            <Image src="usb-stick.svg" alt="Insert USB Image" />
            <Text>
              You may load an election configuration via the following methods:
            </Text>
            <ul>
              <ListItem>
                <strong>Insert a USB drive</strong> with election ballot
                packages exported from Election Manager.
              </ListItem>
              <ListItem>
                <strong>Insert an Admin Card</strong> into an attached card
                reader.
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
        </MainChild>
      </Main>
      {mainNav}
    </Screen>
  )
}

export default ElectionConfiguration
