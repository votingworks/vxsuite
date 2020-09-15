import React, { useCallback, useContext, useState, useEffect } from 'react'
import styled from 'styled-components'
import { useHistory } from 'react-router-dom'
import fileDownload from 'js-file-download'

import dashify from 'dashify'

import { parseElection } from '@votingworks/ballot-encoder'
import { Prose } from '@votingworks/hmpb-ui'
import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import Textarea from '../components/Textarea'
import routerPaths from '../routerPaths'
import ButtonBar from '../components/ButtonBar'
import Modal from '../components/Modal'
import NavigationScreen from '../components/NavigationScreen'
import { TextareaEventFunction } from '../config/types'

const Header = styled.div`
  margin-bottom: 1rem;
`

const FlexTextareaWrapper = styled.div`
  display: flex;
  flex: 1;
  & > textarea {
    flex: 1;
    border: 2px solid #333333;
    min-height: 400px;
    font-family: monospace;
  }
`
const DefinitionEditorScreen = () => {
  const history = useHistory()
  const { electionDefinition, saveElection } = useContext(AppContext)
  const { election, electionData } = electionDefinition!
  const stringifiedElection = JSON.stringify(election, undefined, 2)
  const [electionString, setElectionString] = useState(stringifiedElection)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  const [isConfimingUnconfig, setIsConfimingUnconfig] = useState(false)
  const cancelConfirmingUnconfig = () => {
    setIsConfimingUnconfig(false)
  }
  const initConfirmingUnconfig = () => {
    setIsConfimingUnconfig(true)
  }
  const unconfigureElection = () => {
    saveElection(undefined)
    history.push(routerPaths.root)
  }

  const validateElectionDefinition = useCallback(() => {
    try {
      setError('')
      parseElection(JSON.parse(electionString))
      return true
    } catch (error) {
      setError(error.toString())
      return false
    }
  }, [electionString])
  const editElection: TextareaEventFunction = (event) => {
    setDirty(true)
    setElectionString(event.currentTarget.value)
  }
  const handleSaveElection = () => {
    const valid = validateElectionDefinition()
    if (valid) {
      saveElection(electionString)
      setDirty(false)
      setError('')
    }
  }
  const resetElectionConfig = () => {
    setElectionString(stringifiedElection)
    setDirty(false)
    setError('')
  }

  const downloadElectionDefinition = () => {
    fileDownload(
      electionData,
      `${dashify(election.date)}-${dashify(election.county.name)}-${dashify(
        election.title
      )}-vx-election-definition.json`,
      'application/json'
    )
  }

  useEffect(() => {
    validateElectionDefinition()
  }, [validateElectionDefinition, electionString])

  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
        {error && (
          <Header>
            <Prose maxWidth={false}>{error}</Prose>
          </Header>
        )}
        <ButtonBar padded dark>
          <Button
            small
            primary={dirty && !error}
            onPress={handleSaveElection}
            disabled={!dirty || !!error}
          >
            Save
          </Button>
          <Button small onPress={resetElectionConfig} disabled={!dirty}>
            Reset
          </Button>
          <div />
          <div />
          <div />
          <Button small disabled={dirty} onPress={downloadElectionDefinition}>
            Download
          </Button>
          <Button
            small
            danger={!dirty}
            disabled={dirty}
            onPress={initConfirmingUnconfig}
          >
            Remove
          </Button>
        </ButtonBar>
        <FlexTextareaWrapper>
          <Textarea onChange={editElection} value={electionString} />
        </FlexTextareaWrapper>
      </NavigationScreen>
      <Modal
        isOpen={isConfimingUnconfig}
        centerContent
        content={
          <Prose textCenter>
            <p>Do you want to remove the current election definition?</p>
            <p>All data will be removed from this app.</p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button onPress={cancelConfirmingUnconfig}>Cancel</Button>
            <Button danger onPress={unconfigureElection}>
              Remove Election Definition
            </Button>
          </React.Fragment>
        }
      />
    </React.Fragment>
  )
}

export default DefinitionEditorScreen
