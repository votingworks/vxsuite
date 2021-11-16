import { strict as assert } from 'assert';
import React, { useCallback, useContext, useState, useEffect } from 'react';
import styled from 'styled-components';
import fileDownload from 'js-file-download';

import dashify from 'dashify';

import { safeParseElection } from '@votingworks/types';
import { AppContext } from '../contexts/app_context';

import { Button } from '../components/button';
import { Textarea } from '../components/textarea';
import { ButtonBar } from '../components/button_bar';
import { Prose } from '../components/prose';
import { NavigationScreen } from '../components/navigation_screen';
import { TextareaEventFunction } from '../config/types';
import { RemoveElectionModal } from '../components/remove_election_modal';

const Header = styled.div`
  margin-bottom: 1rem;
`;

const FlexTextareaWrapper = styled.div`
  display: flex;
  flex: 1;
  & > textarea {
    flex: 1;
    border: 2px solid #333333;
    min-height: 400px;
    font-family: monospace;
  }
`;
export function DefinitionEditorScreen({
  allowEditing,
}: {
  allowEditing: boolean;
}): JSX.Element {
  const { electionDefinition, saveElection } = useContext(AppContext);
  assert(electionDefinition);
  const { election, electionData } = electionDefinition;
  const stringifiedElection = JSON.stringify(election, undefined, 2);
  const [electionString, setElectionString] = useState(stringifiedElection);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  const [isConfimingUnconfig, setIsConfimingUnconfig] = useState(false);
  function cancelConfirmingUnconfig() {
    setIsConfimingUnconfig(false);
  }
  function initConfirmingUnconfig() {
    setIsConfimingUnconfig(true);
  }

  const validateElectionDefinition = useCallback(() => {
    const result = safeParseElection(electionString);
    setError(result.err()?.message ?? '');
    return result.isOk();
  }, [electionString]);
  const editElection: TextareaEventFunction = (event) => {
    setDirty(true);
    setElectionString(event.currentTarget.value);
  };
  async function handleSaveElection() {
    const valid = validateElectionDefinition();
    if (valid) {
      await saveElection(electionString);
      setDirty(false);
      setError('');
    }
  }
  function resetElectionConfig() {
    setElectionString(stringifiedElection);
    setDirty(false);
    setError('');
  }

  function downloadElectionDefinition() {
    fileDownload(
      electionData,
      `${dashify(election.date)}-${dashify(election.county.name)}-${dashify(
        election.title
      )}-vx-election-definition.json`,
      'application/json'
    );
  }

  useEffect(() => {
    validateElectionDefinition();
  }, [validateElectionDefinition, electionString]);

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
  );
}
