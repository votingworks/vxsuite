import React, { useContext, useState, useEffect } from 'react'
import { useHistory, useLocation } from 'react-router-dom'
import { Election } from '@votingworks/ballot-encoder'

import readFileAsync from '../lib/readFileAsync'

import { InputEventFunction } from '../config/types'

import defaultElection from '../data/defaultElection.json'

import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import { routerPaths } from '../components/ElectionManager'
import FileInputButton from '../components/FileInputButton'
import { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Loading from '../components/Loading'

const newElection = defaultElection as Election

const UnconfiguredScreen = () => {
  const history = useHistory()
  const location = useLocation()

  const { saveElection } = useContext(AppContext)

  const [isUploading, setIsUploading] = useState(false)

  const [vxElectionFileIsInvalid, setVxElectionFileIsInvalid] = useState(false)
  const createNewElection = () => {
    saveElection(newElection)
    history.push(routerPaths.electionDefinition)
  }
  const handleVxElectionFile: InputEventFunction = async (event) => {
    setIsUploading(true)
    const input = event.currentTarget
    const file = input.files && input.files[0]

    if (file) {
      setVxElectionFileIsInvalid(false)
      try {
        const fileContent = await readFileAsync(file)
        saveElection(JSON.parse(fileContent))
      } catch (error) {
        setVxElectionFileIsInvalid(true)
        setIsUploading(false)
        console.error('handleVxElectionFile failed', error) // eslint-disable-line no-console
      }
    }
  }

  useEffect(() => {
    if (location.pathname !== '/') {
      history.push(routerPaths.root)
    }
  }, [location, history])

  if (isUploading) {
    return (
      <MainChild center>
        <Loading isFullscreen />
      </MainChild>
    )
  }
  return (
    <MainChild center>
      <Prose textCenter>
        <p>Select an existing election definition or create a new one.</p>
        {vxElectionFileIsInvalid && <p>Invalid Vx Election Definition file.</p>}
        <p>
          <FileInputButton
            id="vx-election"
            name="vx-election"
            accept=".json,application/json"
            onChange={handleVxElectionFile}
          >
            Select Vx Election Definition File
          </FileInputButton>
        </p>
        <p>or</p>
        <p>
          <Button onPress={createNewElection}>
            Create New Election Definition
          </Button>
        </p>
      </Prose>
    </MainChild>
  )
}

export default UnconfiguredScreen
