import React, { useCallback, useContext, useState, useEffect } from 'react'
import styled from 'styled-components'
import { useHistory } from 'react-router-dom'
import { Election } from '@votingworks/ballot-encoder'

import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import Textarea from '../components/Textarea'
import { routerPaths } from '../components/ElectionManager'
import { MainChild } from '../components/Main'
import ButtonBar from '../components/ButtonBar'
import Modal from '../components/Modal'
import Prose from '../components/Prose'

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

const EditElectionConfigScreen = () => {
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

  useEffect(() => {
    parseElection()
  }, [parseElection, electionString])

  return (
    <React.Fragment>
      <MainChild>
        <Header>
          <Prose maxWidth={false}>
            <h1>Election Config</h1>
            {error && <p>{error}</p>}
          </Prose>
        </Header>
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
          <Button
            small
            danger={!dirty}
            disabled={dirty}
            onPress={initConfirmingUnconfig}
          >
            Unconfigure
          </Button>
        </ButtonBar>
      </MainChild>
      <FlexTextareaWrapper>
        <Textarea
          onChange={editElection}
          value={electionString}
          resize={false}
        />
      </FlexTextareaWrapper>
      <Modal
        isOpen={isConfimingUnconfig}
        centerContent
        content={
          <Prose textCenter>
            <p>
              Do you want to unconfigure the current election? All data will be
              removed from this app.
            </p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button onPress={cancelConfirmingUnconfig}>Cancel</Button>
            <Button danger onPress={unconfigureElection}>
              Remove Config
            </Button>
          </React.Fragment>
        }
      />
    </React.Fragment>
  )
}

export default EditElectionConfigScreen
