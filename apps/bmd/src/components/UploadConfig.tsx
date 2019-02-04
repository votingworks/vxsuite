import React from 'react'
import Dropzone from 'react-dropzone'
import styled from 'styled-components'

import sampleElectionFile from '../data/election.json'
import isJSON from '../utils/is-json'

import Button from '../components/Button'
import Screen from '../components/Screen'
import { Text } from '../components/Typography'
import { Election } from '../config/types'
import Main from './Main'

const Label = styled.label`
  flex: 1;
  align-self: normal;
  display: inherit;
  flex-direction: inherit;
  align-items: inherit;
  justify-content: inherit;
  margin: 1rem;
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
  constructor(props: Props) {
    super(props)
    this.state = initialState
  }

  public setErrorMessage = (
    errorMessage: string = 'Only election.json file is accepted. Try again.'
  ) => {
    this.setState({
      ...initialState,
      errorMessage,
    })
  }

  public loadSampleElection = () => {
    this.props.setElection(sampleElectionFile)
  }

  public onDrop = (acceptedFiles: File[], rejectedFiles: File[]) => {
    if (acceptedFiles.length === 1) {
      acceptedFiles.forEach((file: File) => {
        if (file.name === 'election.json') {
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
    return (
      <Screen>
        <Main noMargin>
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
                  data-testid="dropzone"
                  htmlFor="election-file-upload"
                  {...getRootProps({ refKey: 'ref' })}
                >
                  <input
                    id="election-file-upload"
                    data-testid="file-input"
                    {...getInputProps()}
                  />
                  {isDragActive ? (
                    <p>Drop files here…</p>
                  ) : (
                    <div>
                      <h1>Configure Ballot Marking Device</h1>
                      <p>
                        Drop <code>election.json</code> file here, or click to
                        browse for file.
                      </p>
                      {errorMessage && <Text error>{errorMessage}</Text>}
                    </div>
                  )}
                </Label>
              )}
            </Dropzone>
          )}
        </Main>
        <Text center>
          <a href="/data/election.json">
            Download sample <code>election.json</code> file
          </a>
          , or skip upload and{' '}
          <Button onClick={this.loadSampleElection}>Load Sample</Button>
        </Text>
      </Screen>
    )
  }
}

export default UploadConfig
