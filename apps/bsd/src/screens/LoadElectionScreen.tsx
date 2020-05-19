import React from 'react'
import { useDropzone } from 'react-dropzone'
import { SetElection } from '../config/types'

import Prose from '../components/Prose'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'
import Text from '../components/Text'

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

  if (process.env.NODE_ENV === 'production') {
    return (
      <Screen>
        <Main>
          <MainChild center>
            <Prose textCenter>
              <h1>Not Configured</h1>
              <p>Insert Election Clerk card.</p>
            </Prose>
          </MainChild>
        </Main>
        <MainNav />
      </Screen>
    )
  }

  return (
    <Screen {...getRootProps()}>
      <Main noPadding>
        <MainChild center padded>
          <input {...getInputProps()} />
          <Prose textCenter>
            {isDragActive ? (
              <p>Drop files here…</p>
            ) : (
              <React.Fragment>
                <h1>Not Configured</h1>
                <Text narrow>
                  Insert Election Clerk card, drag and drop{' '}
                  <code>election.json</code> file here, or click to browse for
                  file.
                </Text>
              </React.Fragment>
            )}
          </Prose>
        </MainChild>
      </Main>
      <MainNav />
    </Screen>
  )
}

export default LoadElectionConfigScreen
