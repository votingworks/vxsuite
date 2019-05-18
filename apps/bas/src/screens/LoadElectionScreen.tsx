import React from 'react'
import { useDropzone } from 'react-dropzone'
import { SetElection } from '../config/types'

import Main, { MainChild } from '../components/Main'
import Screen from '../components/Screen'

interface Props {
  setElection: SetElection
}

const LoadElectionConfigScreen = ({ setElection }: Props) => {
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 1) {
      const file = acceptedFiles[0]
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        setElection(JSON.parse(result))
      }
      reader.readAsText(file)
    }
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <Screen {...getRootProps()}>
      <Main noPadding>
        <MainChild center padded>
          <input {...getInputProps()} />
          {isDragActive ? (
            <p>Drop files here…</p>
          ) : (
            <React.Fragment>
              <h1>Load Election Configuration File</h1>
              <p>
                Drag and drop <code>election.json</code> file here, or click to
                browse for file.
              </p>
            </React.Fragment>
          )}
        </MainChild>
      </Main>
    </Screen>
  )
}

export default LoadElectionConfigScreen
