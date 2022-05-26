import { assert } from '@votingworks/utils';
import React, { useCallback, useContext, useState, useEffect } from 'react';
import styled from 'styled-components';
import fileDownload from 'js-file-download';

import dashify from 'dashify';

import { safeParseElection } from '@votingworks/types';
import { Prose } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { Button } from '../components/button';
import { Textarea } from '../components/textarea';
import { ButtonBar } from '../components/button_bar';
import { NavigationScreen } from '../components/navigation_screen';
import { TextareaEventFunction } from '../config/types';
import { RemoveElectionModal } from '../components/remove_election_modal';

const Header = styled.div`
  margin: 1rem;
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

  const [isConfirmingUnconfigure, setIsConfirmingUnconfigure] = useState(false);
  const cancelConfirmingUnconfigure = useCallback(() => {
    setIsConfirmingUnconfigure(false);
  }, []);
  const initConfirmingUnconfigure = useCallback(() => {
    setIsConfirmingUnconfigure(true);
  }, []);

  const validateElectionDefinition = useCallback(() => {
    const result = safeParseElection(electionString);
    setError(result.err()?.message ?? '');
    return result.isOk();
  }, [electionString]);
  const editElection: TextareaEventFunction = (event) => {
    setDirty(true);
    setElectionString(event.currentTarget.value);
  };
  const handleSaveElection = useCallback(async () => {
    const valid = validateElectionDefinition();
    if (valid) {
      await saveElection(electionString);
      setDirty(false);
      setError('');
    }
  }, [electionString, saveElection, validateElectionDefinition]);
  const resetElectionConfig = useCallback(() => {
    setElectionString(stringifiedElection);
    setDirty(false);
    setError('');
  }, [stringifiedElection]);

  const downloadElectionDefinition = useCallback(() => {
    fileDownload(
      electionData,
      `${dashify(election.date)}-${dashify(election.county.name)}-${dashify(
        election.title
      )}-vx-election-definition.json`,
      'application/json'
    );
  }, [election.county.name, election.date, election.title, electionData]);

  useEffect(() => {
    validateElectionDefinition();
  }, [validateElectionDefinition, electionString]);

  return (
    <React.Fragment>
      <NavigationScreen flexColumn>
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
            onPress={initConfirmingUnconfigure}
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
      {isConfirmingUnconfigure && (
        <RemoveElectionModal onClose={cancelConfirmingUnconfigure} />
      )}
    </React.Fragment>
  );
}
