import React from 'react'
import Dropzone from 'react-dropzone'

import Article from '../components/Article'
import Screen from '../components/Screen'
import { Text } from '../components/Typography'
import { OptionalElection } from '../config/types'

interface Props {
  setElection: (election: OptionalElection) => void
}
interface State {
  errorMessage: string
  loading: boolean
}

class ConfigPage extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      errorMessage: '',
      loading: false,
    }
  }

  public setErrorMessage = (
    errorMessage: string = 'Only election.json file is accepted. Try again.'
  ) => {
    this.setState({
      errorMessage,
      loading: false,
    })
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
            setTimeout(() => {
              if (typeof result === 'string') {
                const election = JSON.parse(result)
                // TODO: Test that uploaded election.json file matches expected object shape. https://github.com/votingworks/bmd/issues/23
                this.props.setElection(election)
              } else {
                reader.abort()
              }
            }, 1000)
          }
          reader.onabort = () =>
            this.setErrorMessage(
              'File content must be JSON text only. Try again.'
            )
          reader.onerror = () =>
            this.setErrorMessage('Unable to read file. Try again.')
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
    const { loading, errorMessage } = this.state
    return (
      <Screen>
        {loading ? (
          <Article>
            <p>Loading file…</p>
          </Article>
        ) : (
          <Dropzone
            accept="application/json"
            onDrop={this.onDrop}
            multiple={false}
          >
            {({ getRootProps, getInputProps, isDragActive }) => (
              <Article {...getRootProps({ refKey: 'ref' })}>
                <input {...getInputProps()} />
                {isDragActive ? (
                  <p>Drop files here...</p>
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
              </Article>
            )}
          </Dropzone>
        )}
        <Text center>
          <a href="/data/election.json">
            View sample <code>election.json</code> file.
          </a>
        </Text>
      </Screen>
    )
  }
}

export default ConfigPage
