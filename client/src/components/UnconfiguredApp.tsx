import React, { useState, useEffect } from 'react'
import { useHistory, useLocation } from 'react-router-dom'
import { Election, OptionalElection } from '@votingworks/ballot-encoder'

import readFileAsync from '../lib/readFileAsync'

import { InputEventFunction } from '../config/types'

import defaultElection from '../data/defaultElection.json'

import Button from './Button'
import { routerPaths } from './ElectionManager'
import FileInputButton from './FileInputButton'
import Main, { MainChild } from './Main'
import Screen from './Screen'

interface Props {
  election: OptionalElection
  saveElection: (election: Election) => void
}

const newElection = defaultElection as Election

const UnconfiguredApp = ({ election, saveElection }: Props) => {
  const history = useHistory()
  const location = useLocation()

  const [vxElectionFileIsInvalid, setVxElectionFileIsInvalid] = useState(false)
  const createNewElection = () => {
    saveElection(newElection)
    history.push(routerPaths.electionConfig)
  }
  const handleVxElectionFile: InputEventFunction = async (event) => {
    const input = event.currentTarget
    const file = input.files && input.files[0]

    if (file) {
      setVxElectionFileIsInvalid(false)
      try {
        const fileContent = await readFileAsync(file)
        saveElection(JSON.parse(fileContent))
      } catch (error) {
        setVxElectionFileIsInvalid(true)
        console.error('handleVxElectionFile failed', error) // eslint-disable-line no-console
      }
    }
  }

  useEffect(() => {
    if (location.pathname !== '/') {
      history.push(routerPaths.root)
    }
  }, [location, history])

  return (
    <Screen>
      <Main padded>
        <MainChild>
          <h1>Unconfigured App</h1>
          {vxElectionFileIsInvalid && (
            <p>Invalid Vx Election Definition file.</p>
          )}
          <FileInputButton
            id="vx-election"
            name="vx-election"
            accept=".json,application/json"
            onChange={handleVxElectionFile}
          >
            Select Vx Election Definition file
          </FileInputButton>{' '}
          <Button onPress={createNewElection}>Create New Election</Button>
          <pre>
            <code>{JSON.stringify(election, null, 2)}</code>
          </pre>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default UnconfiguredApp
