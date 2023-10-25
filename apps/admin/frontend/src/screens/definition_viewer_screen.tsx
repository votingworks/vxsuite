import { assert } from '@votingworks/basics';
import React, { useContext, useState } from 'react';
import fileDownload from 'js-file-download';

import dashify from 'dashify';

import { Button, Pre, WithScrollButtons } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';

import { ButtonBar } from '../components/button_bar';
import { NavigationScreen } from '../components/navigation_screen';
import { RemoveElectionModal } from '../components/remove_election_modal';

export function DefinitionViewerScreen(): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  assert(electionDefinition);
  const { election, electionData } = electionDefinition;
  const electionString = JSON.stringify(election, undefined, 2);

  const [isConfirmingUnconfig, setIsConfirmingUnconfig] = useState(false);
  function cancelConfirmingUnconfig() {
    setIsConfirmingUnconfig(false);
  }
  function initConfirmingUnconfig() {
    setIsConfirmingUnconfig(true);
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

  return (
    <React.Fragment>
      <NavigationScreen flexColumn title="Election Definition JSON">
        <ButtonBar padded>
          <div />
          <div />
          <div />
          <Button icon="Save" onPress={downloadElectionDefinition}>
            Save
          </Button>
          <Button icon="Delete" onPress={initConfirmingUnconfig}>
            Remove
          </Button>
        </ButtonBar>
        <WithScrollButtons>
          <code>
            <Pre>{electionString}</Pre>
          </code>
        </WithScrollButtons>
      </NavigationScreen>
      {isConfirmingUnconfig && (
        <RemoveElectionModal onClose={cancelConfirmingUnconfig} />
      )}
    </React.Fragment>
  );
}
