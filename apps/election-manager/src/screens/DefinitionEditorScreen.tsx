import React, { useCallback, useContext, useState, useEffect } from 'react'
import styled from 'styled-components'
import fileDownload from 'js-file-download'

import dashify from 'dashify'

import { safeParseElection } from '@votingworks/types'
import AppContext from '../contexts/AppContext'

import Button from '../components/Button'
import Textarea from '../components/Textarea'
import ButtonBar from '../components/ButtonBar'
import Prose from '../components/Prose'
import NavigationScreen from '../components/NavigationScreen'
import { TextareaEventFunction } from '../config/types'
import RemoveElectionModal from '../components/RemoveElectionModal'

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
const DefinitionEditorScreen: React.FC<{ allowEditing: boolean }> = ({
  allowEditing,
}) => {
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

  const validateElectionDefinition = useCallback(() => {
    const result = safeParseElection(electionString)
    setError(result.err()?.message ?? '')
    return result.isOk()
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
          {allowEditing && (
            <React.Fragment>
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
            </React.Fragment>
          )}
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
            disabled={!allowEditing}
            data-testid="json-input"
          />
        </FlexTextareaWrapper>
      </NavigationScreen>
      {isConfimingUnconfig && (
        <RemoveElectionModal onClose={cancelConfirmingUnconfig} />
      )}
    </React.Fragment>
  )
}

export default DefinitionEditorScreen
