import React, { useEffect, useState, useCallback } from 'react'
import path from 'path'

import styled from 'styled-components'
import Prose from './Prose'
import Main, { MainChild } from './Main'
import MainNav from './MainNav'
import Screen from './Screen'
import Text from './Text'
import Loading from './Loading'
import FileInputButton, { HiddenFileInput } from './FileInputButton'
import ChoiceButton from './ChoiceButton'

import USBControllerButton from './USBControllerButton'
import { UsbDriveStatus, getDevicePath } from '../lib/usbstick'
import {
  parseBallotExportPackageInfoFromFilename,
  BALLOT_PACKAGE_FOLDER,
} from '../util/filenames'
import Button from './Button'

const Image = styled.img`
  margin: 0 auto -1.75rem;
  max-width: 300px;
`

export const ChoicesGrid = styled.div`
  display: grid;
  grid-auto-rows: minmax(auto, 1fr);
  grid-gap: 1rem;
  p {
    margin: 2px 0;
  }
`

export const Container = styled.div`
  margin: 0 10vw;
`

export const Footer = styled.div`
  width: 100%;
  justify-content: flex-end;
  margin: 10px 0;
  display: flex;
  > button {
    margin-left: 5px;
  }
`

export const LinkLabel = styled.label`
  color: rgb(0, 0, 238);
  text-decoration: underline;
  cursor: pointer;
`

export const Title = styled.strong`
  text-transform: capitalize;
`

export interface Props {
  acceptManuallyChosenFile(file: File): void
  acceptAutomaticallyChosenFile(file: KioskBrowser.FileSystemEntry): void
  usbDriveStatus: UsbDriveStatus
}

const ElectionConfiguration: React.FC<Props> = ({
  acceptAutomaticallyChosenFile,
  acceptManuallyChosenFile,
  usbDriveStatus,
}) => {
  const [foundFilenames, setFoundFilenames] = useState<
    KioskBrowser.FileSystemEntry[]
  >([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [selectedFile, setSelectedFile] = useState<
    KioskBrowser.FileSystemEntry | undefined
  >(undefined)

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
    const fileNames = foundFilenames.map((f) => f.name)

    const handleFileChoiceSelect = (
      event: React.MouseEvent<HTMLInputElement>
    ) => {
      const targettedFile = event.currentTarget.dataset.choice
      if (selectedFile && targettedFile === selectedFile.name) {
        setSelectedFile(undefined)
      } else if (targettedFile) {
        const foundFile = foundFilenames.find((f) => f.name === targettedFile)
        setSelectedFile(foundFile)
      }
    }

    // Add UI from BMD
    const fileOptions = []
    for (const filename of fileNames) {
      const parsedInfo = parseBallotExportPackageInfoFromFilename(filename)
      // If we couldn't parse this file, don't show an option for it
      if (parsedInfo) {
        const {
          electionCounty,
          electionName,
          electionHash,
          timestamp,
        } = parsedInfo
        fileOptions.push(
          <ChoiceButton
            choice={filename}
            key={filename}
            isSelected={!!(selectedFile && selectedFile.name === filename)}
            onPress={handleFileChoiceSelect}
            fullWidth
          >
            <Prose>
              <Title>
                {electionCounty} - {electionName}
              </Title>{' '}
              <Text small>Election ID : {electionHash}</Text>
              {timestamp && (
                <Text small>Exported On {timestamp.toLocaleString()}</Text>
              )}
            </Prose>
          </ChoiceButton>
        )
      }
    }

    // If there were no valid files found prompt the user to select a file themselves.
    if (fileOptions.length === 0) {
      return (
        <Screen>
          <Main noPadding>
            <MainChild center padded>
              <Prose textCenter>
                <h1>No Ballot Packages Found</h1>
                <Container>
                  <Text narrow>
                    No ballot packages were automatically found on the inserted
                    USB device. If you have not already please connect this USB
                    device to your Election Manager to export the ballot
                    package. Otherwise you may select a file from the device
                    manually, or insert an election admin card at any time to
                    configure this machine.
                  </Text>
                  <Footer>
                    <FileInputButton
                      accept=".json,.zip"
                      onChange={handleFileInput}
                      data-testid="manual-upload-input"
                    >
                      Select Configuration File
                    </FileInputButton>
                    <USBControllerButton primary />
                  </Footer>
                </Container>
              </Prose>
            </MainChild>
          </Main>
          {mainNav}
        </Screen>
      )
    }

    return (
      <Screen>
        <Main noPadding>
          <MainChild padded maxWidth={false}>
            <h1>Choose Election Configuration</h1>
            <Container>
              <Text>
                Choose the election you want to configure this machine for. If
                you do not see the election you are looking for you may also{' '}
                <LinkLabel>
                  <HiddenFileInput
                    type="file"
                    accept=".json,.zip"
                    onChange={handleFileInput}
                  />
                  select a file manually.
                </LinkLabel>{' '}
                You can also configure this machine by inserting an election
                admin card at any time.
              </Text>
              <ChoicesGrid>{fileOptions}</ChoicesGrid>
              <Footer>
                <USBControllerButton />
                <Button
                  primary
                  disabled={!selectedFile}
                  onPress={() => acceptAutomaticallyChosenFile(selectedFile!)}
                >
                  Configure
                </Button>
              </Footer>
            </Container>
          </MainChild>
        </Main>
        {mainNav}
      </Screen>
    )
  }

  // No USB Drive was found show initial screen.
  return (
    <Screen>
      <Main noPadding>
        <MainChild center padded>
          <Prose textCenter>
            <React.Fragment>
              <Image src="usb-stick.svg" alt="Insert USB Image" />
              <h1>Not Configured</h1>
              <Text narrow>
                Insert Election Admin card or a USB drive containing the Ballot
                Package archive from Election Manager in order to configure this
                machine.
              </Text>
              <FileInputButton
                accept=".json,.zip"
                onChange={handleFileInput}
                data-testid="manual-upload-input"
              >
                Select Configuration File
              </FileInputButton>
            </React.Fragment>
          </Prose>
        </MainChild>
      </Main>
      {mainNav}
    </Screen>
  )
}

export default ElectionConfiguration
