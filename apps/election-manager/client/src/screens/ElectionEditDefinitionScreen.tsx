import React, { useCallback, useContext, useState, useEffect } from 'react'
import styled from 'styled-components'
import { useHistory } from 'react-router-dom'
import fileDownload from 'js-file-download'
import { Election } from '@votingworks/ballot-encoder'
import dashify from 'dashify'

import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import Textarea from '../components/Textarea'
import { routerPaths } from '../components/ElectionManager'
import ButtonBar from '../components/ButtonBar'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import NavigationScreen from '../components/NavigationScreen'

const Header = styled.div`
  margin-bottom: 1rem;
`

const FlexTextareaWrapper = styled.div`
  flex: 1;
  display: flex;
  & > textarea {
    flex: 1;
  }
`

const ElectionEditDefinitionScreen = () => {
  const history = useHistory()
  const { election: e, saveElection } = useContext(AppContext)
  const election = e as Election
  const stringifiedElection = JSON.stringify(election, null, 2)
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

  const parseElection = useCallback(() => {
    try {
      setError('')
      const newElection = JSON.parse(electionString)
      return newElection
    } catch (error) {
      setError(error.toString())
      return false
    }
  }, [electionString])
  const editElection = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDirty(true)
    setElectionString(event.target.value)
  }
  const hanldeSaveElection = () => {
    const newElection = parseElection()
    if (newElection) {
      saveElection(newElection)
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
      JSON.stringify(election, null, 2),
      `${dashify(election.date)}-${dashify(election.county.name)}-${dashify(
        election.title
      )}-vx-election-definition.json`,
      'application/json'
    )
  }

  useEffect(() => {
    parseElection()
  }, [parseElection, electionString])

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
            onPress={hanldeSaveElection}
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
          <Textarea
            onChange={editElection}
            value={electionString}
            resize={false}
          />
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

export default ElectionEditDefinitionScreen
