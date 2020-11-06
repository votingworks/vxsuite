import React from 'react'
import { useDropzone } from 'react-dropzone'

import Prose from './Prose'
import Main, { MainChild } from './Main'
import MainNav from './MainNav'
import Screen from './Screen'
import Text from './Text'

import USBControllerButton from './USBControllerButton'

export interface Props {
  acceptFiles(files: readonly File[]): void
}

const ElectionConfiguration: React.FC<Props> = ({ acceptFiles }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop(files: readonly File[]) {
      acceptFiles(files)
    },
    accept: ['application/json', 'application/zip'],
  })

  return (
    <Screen>
      <Main noPadding {...getRootProps()}>
        <MainChild center padded>
          <input
            {...getInputProps({
              title: 'Select election.json or ballot package',
            })}
          />
          <Prose textCenter>
            {isDragActive ? (
              <p>Drop files here…</p>
            ) : (
              <React.Fragment>
                <h1>Not Configured</h1>
                <Text narrow>
                  Insert Election Admin card, drag and drop{' '}
                  <code>election.json</code> or ballot package <code>zip</code>{' '}
                  file here, or click to browse for file.
                </Text>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <MainNav isTestMode={false}>
        <USBControllerButton />
      </MainNav>
    </Screen>
  )
}

export default ElectionConfiguration
