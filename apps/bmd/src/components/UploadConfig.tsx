import React from 'react'
import Dropzone from 'react-dropzone'
import styled from 'styled-components'

import electionSample from '../data/electionSample.json'
import isJSON from '../utils/isJSON'

import Button from './Button'
import Prose from './Prose'
import { Election } from '../config/types'
import Main, { MainChild } from './Main'
import MainNav from './MainNav'
import Text from './Text'

const Label = styled.label`
  display: flex;
  flex: 1;
  margin: auto;
  width: 100%;
`

const Footer = styled.footer`
  padding: 1rem;
`

interface Props {
  setElection: (election: Election) => void
}
interface State {
  errorMessage: string
  loaded: boolean
  loading: boolean
}

const initialState = {
  errorMessage: '',
  loaded: false,
  loading: false,
}

class UploadConfig extends React.Component<Props, State> {
  public state: State = initialState

  public setErrorMessage = (
    errorMessage: string = 'Only files that end in ".json" are accepted. Try again.'
  ) => {
    this.setState({
      ...initialState,
      errorMessage,
    })
  }

  public loadSampleElection = () => {
    this.props.setElection(electionSample as Election)
  }

  public onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 1) {
      acceptedFiles.forEach((file: File) => {
        if (file.name.endsWith('.json')) {
          const reader = new FileReader()
          reader.onload = () => {
            this.setState({
              loading: true,
            })
            const result = reader.result
            if (typeof result === 'string' && isJSON(result)) {
              window.setTimeout(() => {
                this.setState({
                  ...initialState,
                  loaded: true,
                })
                const election = JSON.parse(result)
                // TODO: Test that uploaded election.json file matches expected object shape. https://github.com/votingworks/bmd/issues/23
                this.props.setElection(election)
              }, 100)
            } else {
              this.setErrorMessage(
                'File content must be JSON text only. Try again.'
              )
            }
          }
          reader.readAsText(file)
        } else {
          this.setErrorMessage()
        }
      })
    } else {
      this.setErrorMessage()
    }
  }

  public render() {
    const { loading, loaded, errorMessage } = this.state
    if (process.env.NODE_ENV === 'test') {
      return (
        <>
          <Main noPadding>
            {loading || loaded ? (
              <p>{loaded ? 'File loaded' : 'Loading file…'} </p>
            ) : (
              <Dropzone
                accept="application/json"
                onDrop={this.onDrop}
                multiple={false}
              >
                {({ getRootProps, getInputProps, isDragActive }) => (
                  <Label
                    // TODO:: remove "as" after issue resolved:
                    // https://github.com/react-dropzone/react-dropzone/issues/182
                    as="div"
                    data-testid="dropzone"
                    htmlFor="election-file-upload"
                    {...getRootProps()}
                  >
                    <MainChild center padded>
                      <input
                        id="election-file-upload"
                        data-testid="file-input"
                        {...getInputProps()}
                      />
                      <Prose textCenter>
                        {isDragActive ? (
                          <p>Drop files here…</p>
                        ) : (
                          <React.Fragment>
                            <h1>Load Election Configuration File</h1>
                            <p>
                              Drag and drop <code>election.json</code> file
                              here, or click to browse for file.
                            </p>
                            {errorMessage && <Text error>{errorMessage}</Text>}
                          </React.Fragment>
                        )}
                      </Prose>
                    </MainChild>
                  </Label>
                )}
              </Dropzone>
            )}
          </Main>
          <Footer>
            <Prose textCenter>
              <Text center small>
                <a href="/data/election.json">
                  Download sample <code>election.json</code> file
                </a>{' '}
                to upload, or{' '}
                <Button onPress={this.loadSampleElection}>
                  Load Sample Election File
                </Button>
              </Text>
            </Prose>
          </Footer>
        </>
      )
    }
    return (
      <React.Fragment>
        <Main>
          <MainChild center>
            <Prose textCenter>
              <h1>Device Not Configured</h1>
              <p>Insert Election Clerk card.</p>
            </Prose>
          </MainChild>
        </Main>
        <MainNav />
      </React.Fragment>
    )
  }
}

export default UploadConfig
